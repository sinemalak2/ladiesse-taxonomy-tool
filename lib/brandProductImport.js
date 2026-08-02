// Pushes a brand's already-synced catalogue (brand_products/brand_product_variants
// — populated by lib/brandSync.js pulling FROM the brand's own store) INTO
// la-diesse.myshopify.com as draft products, vendor set to the brand's name.
//
// Uses App B's OWN connection to la-diesse.myshopify.com (a real installed
// OAuth token, stored in ladiesse_shopify_connection — see
// app/api/admin/ladiesse-shopify/{install,callback}/route.js), not App A's
// client-credentials grant (lib/shopify.js). App B owns the entire brand
// pipeline end-to-end: pulling from each brand's store AND pushing into
// la-diesse's own store, so it needs a real token for la-diesse too, gotten
// the same way a brand connects — a one-time staff-triggered install.
import { getPool } from './db.js';
import { brandShopifyGraphql } from './brandShopify.js';
import { decryptToken } from './brandTokenEncryption.js';
import { getExchangeRate, convertPrice } from './exchangeRates.js';

const SHOP_INFO_QUERY = `
  query LadiesseShopInfo {
    shop {
      currencyCode
    }
    locations(first: 1) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

const PRODUCT_SET_MUTATION = `
  mutation ProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
    productSet(input: $input, identifier: $identifier, synchronous: true) {
      product {
        id
        variants(first: 100) {
          edges {
            node {
              id
              sku
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// A brand's legal country (used elsewhere for tax ID/bank format) isn't a
// reliable proxy for their store's actual currency — this is only a
// fallback for connections made before currency capture existed.
const COUNTRY_CURRENCY_FALLBACK = { TR: 'TRY', US: 'USD' };

function buildFileInput(url) {
  return { originalSource: url, contentType: 'IMAGE' };
}

function buildProductOptionsInput(options) {
  return (options ?? []).map((o) => ({
    name: o.name,
    values: (o.values ?? []).map((v) => ({ name: v })),
  }));
}

function buildMetafieldsInput(metafields) {
  return (metafields ?? []).map((m) => ({ namespace: m.namespace, key: m.key, value: m.value, type: m.type }));
}

function buildVariantInput(variant, rate, locationId, fileByUrl) {
  const input = {
    price: String(convertPrice(Number(variant.price), rate)),
    optionValues: (variant.option_values ?? []).map((ov) => ({ optionName: ov.name, name: ov.value })),
    inventoryQuantities: [{ locationId, name: 'available', quantity: variant.inventory_quantity ?? 0 }],
  };
  if (variant.sku) input.sku = variant.sku;
  if (variant.compare_at_price != null) {
    input.compareAtPrice = String(convertPrice(Number(variant.compare_at_price), rate));
  }
  if (variant.weight_value != null && variant.weight_unit) {
    input.inventoryItem = { measurement: { weight: { value: Number(variant.weight_value), unit: variant.weight_unit } } };
  }
  const file = variant.image_url && fileByUrl.get(variant.image_url);
  if (file) input.file = file;
  if (variant.imported_shopify_variant_gid) input.id = variant.imported_shopify_variant_gid;
  return input;
}

async function getLadiesseShopInfo(ladiesseShop) {
  const data = await brandShopifyGraphql({ ...ladiesseShop, query: SHOP_INFO_QUERY });
  return {
    currency: data.shop.currencyCode,
    locationId: data.locations.edges[0]?.node?.id,
  };
}

async function importOneProduct({ product, variants, brandName, rate, locationId, ladiesseShop }) {
  const imageUrls = product.image_urls ?? [];
  const files = imageUrls.map(buildFileInput);
  const fileByUrl = new Map(imageUrls.map((url, i) => [url, files[i]]));

  const input = {
    title: product.title,
    descriptionHtml: product.body_html || undefined,
    vendor: brandName,
    status: 'DRAFT',
    productType: product.product_type || undefined,
    productOptions: buildProductOptionsInput(product.options),
    // Carried through verbatim from the brand's own store, per an explicit
    // decision to push rather than keep internal-only. category is a
    // Standard Product Taxonomy node ID — canonical/shared across every
    // Shopify store, so the same GID from the brand's store is valid as-is
    // on la-diesse's store with no translation needed.
    tags: product.tags ?? [],
    category: product.category_gid || undefined,
    metafields: buildMetafieldsInput(product.metafields),
    files,
    variants: variants.map((v) => buildVariantInput(v, rate, locationId, fileByUrl)),
  };

  const identifier = product.imported_shopify_product_gid ? { id: product.imported_shopify_product_gid } : null;

  const data = await brandShopifyGraphql({
    ...ladiesseShop,
    query: PRODUCT_SET_MUTATION,
    variables: { input, identifier },
  });
  const userErrors = data.productSet.userErrors;
  if (userErrors.length > 0) {
    throw new Error(`productSet failed for "${product.title}": ${userErrors.map((e) => e.message).join('; ')}`);
  }

  return data.productSet.product;
}

// Runs a full push of one brand's brand_products into la-diesse.myshopify.com.
// If `jobId` is passed (the pull-sync trigger point creates a 'pending' row
// right after syncBrandProducts completes), that row is updated in place;
// otherwise a fresh product_import_jobs row is created (staff manual re-push).
export async function importBrandProductsToLadiesse({ brandId, jobId = null }) {
  const client = await getPool().connect();
  let effectiveJobId = jobId;

  try {
    // Create/mark-running the job row FIRST, before any Shopify API calls —
    // otherwise a failure in the shop-info or FX lookup (as happened during
    // testing: a missing scope) leaves no audit trail at all, which is the
    // one thing this table exists for.
    if (effectiveJobId) {
      await client.query(`UPDATE product_import_jobs SET status = 'running', started_at = now() WHERE id = $1`, [
        effectiveJobId,
      ]);
    } else {
      const { rows } = await client.query(
        `INSERT INTO product_import_jobs (brand_id, status, triggered_by, started_at)
         VALUES ($1, 'running', 'manual', now()) RETURNING id`,
        [brandId]
      );
      effectiveJobId = rows[0].id;
    }

    const { rows: brandRows } = await client.query(
      `SELECT b.brand_name, bpc.currency AS brand_currency, b.country
       FROM brands b
       LEFT JOIN brand_platform_connections bpc ON bpc.brand_id = b.id AND bpc.platform = 'shopify'
       WHERE b.id = $1`,
      [brandId]
    );
    if (brandRows.length === 0) throw new Error('Brand not found');
    const { brand_name: brandName, brand_currency: brandCurrencyRaw, country } = brandRows[0];
    const brandCurrency = brandCurrencyRaw || COUNTRY_CURRENCY_FALLBACK[country];
    if (!brandCurrency) throw new Error(`No currency known for brand ${brandId} — cannot convert prices`);

    const { rows: connRows } = await client.query(
      `SELECT shop_domain, access_token_ref FROM ladiesse_shopify_connection
       WHERE status = 'active' ORDER BY connected_at DESC LIMIT 1`
    );
    if (connRows.length === 0) {
      throw new Error(
        'La-diesse has no active Shopify connection yet — a staff member needs to visit /api/admin/ladiesse-shopify/install to connect App B to la-diesse.myshopify.com first.'
      );
    }
    const ladiesseShop = {
      shopDomain: connRows[0].shop_domain,
      accessToken: decryptToken(connRows[0].access_token_ref),
    };

    const { currency: ladiesseCurrency, locationId } = await getLadiesseShopInfo(ladiesseShop);
    if (!locationId) throw new Error('la-diesse.myshopify.com has no location to assign inventory to');

    const { rate, fetchedAt } = await getExchangeRate(brandCurrency, ladiesseCurrency);

    await client.query(
      `UPDATE product_import_jobs
       SET fx_from_currency = $1, fx_to_currency = $2, fx_rate = $3, fx_fetched_at = $4
       WHERE id = $5`,
      [brandCurrency, ladiesseCurrency, rate, fetchedAt, effectiveJobId]
    );

    const { rows: products } = await client.query(
      `SELECT id, title, body_html, product_type, options, image_urls, tags, category_gid, metafields, imported_shopify_product_gid
       FROM brand_products WHERE brand_id = $1`,
      [brandId]
    );

    let created = 0;
    let updated = 0;

    for (const product of products) {
      const { rows: variants } = await client.query(
        `SELECT sku, price, compare_at_price, inventory_quantity, image_url, option_values,
                weight_value, weight_unit, imported_shopify_variant_gid
         FROM brand_product_variants WHERE brand_product_id = $1`,
        [product.id]
      );

      const wasAlreadyImported = !!product.imported_shopify_product_gid;
      const result = await importOneProduct({ product, variants, brandName, rate, locationId, ladiesseShop });

      await client.query(
        `UPDATE brand_products SET imported_shopify_product_gid = $1, imported_at = now() WHERE id = $2`,
        [result.id, product.id]
      );

      // Match returned variants back to our rows by SKU to record each
      // one's Shopify variant GID — needed so a future re-import updates
      // this exact variant instead of creating a duplicate.
      const returnedBySku = new Map(
        result.variants.edges.map((edge) => [edge.node.sku, edge.node.id]).filter(([sku]) => sku)
      );
      for (const variant of variants) {
        const variantGid = variant.sku && returnedBySku.get(variant.sku);
        if (variantGid) {
          await client.query(
            `UPDATE brand_product_variants SET imported_shopify_variant_gid = $1
             WHERE brand_product_id = $2 AND sku = $3`,
            [variantGid, product.id, variant.sku]
          );
        }
      }

      if (wasAlreadyImported) updated++;
      else created++;
    }

    await client.query(
      `UPDATE product_import_jobs SET status = 'completed', completed_at = now(),
         products_created = $1, products_updated = $2
       WHERE id = $3`,
      [created, updated, effectiveJobId]
    );
    return { created, updated };
  } catch (err) {
    if (effectiveJobId) {
      await client
        .query(
          `UPDATE product_import_jobs SET status = 'failed', completed_at = now(), error_message = $1 WHERE id = $2`,
          [err.message, effectiveJobId]
        )
        .catch(() => {});
    }
    throw err;
  } finally {
    client.release();
  }
}
