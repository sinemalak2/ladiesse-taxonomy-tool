import { getPool } from './db.js';
import { brandShopifyGraphql, BRAND_PRODUCTS_QUERY, extractBrandProductNode } from './brandShopify.js';
import { classifyUpsertResult, summarizeResults } from './sync.js';

const PAGE_SIZE = 50;

// Same IS DISTINCT FROM diffing pattern as lib/sync.js's UPSERT_PRODUCT_SQL,
// but brand_products has a UUID PK (not the Shopify GID itself), so we need
// the row's id back either way to upsert its variants — hence the fallback
// SELECT in upsertBrandProduct() below when the WHERE clause skips an
// unchanged row (Postgres returns nothing from RETURNING in that case).
const UPSERT_BRAND_PRODUCT_SQL = `
  INSERT INTO brand_products
    (brand_id, platform_connection_id, shopify_product_gid, title, body_html, handle, product_type, vendor, status, options, image_urls, tags, category_gid, category_name, metafields, raw_shopify_data, synced_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
  ON CONFLICT (brand_id, shopify_product_gid) DO UPDATE SET
    platform_connection_id = EXCLUDED.platform_connection_id,
    title = EXCLUDED.title,
    body_html = EXCLUDED.body_html,
    handle = EXCLUDED.handle,
    product_type = EXCLUDED.product_type,
    vendor = EXCLUDED.vendor,
    status = EXCLUDED.status,
    options = EXCLUDED.options,
    image_urls = EXCLUDED.image_urls,
    tags = EXCLUDED.tags,
    category_gid = EXCLUDED.category_gid,
    category_name = EXCLUDED.category_name,
    metafields = EXCLUDED.metafields,
    raw_shopify_data = EXCLUDED.raw_shopify_data,
    synced_at = now()
  WHERE
    brand_products.title IS DISTINCT FROM EXCLUDED.title OR
    brand_products.body_html IS DISTINCT FROM EXCLUDED.body_html OR
    brand_products.handle IS DISTINCT FROM EXCLUDED.handle OR
    brand_products.product_type IS DISTINCT FROM EXCLUDED.product_type OR
    brand_products.vendor IS DISTINCT FROM EXCLUDED.vendor OR
    brand_products.status IS DISTINCT FROM EXCLUDED.status OR
    brand_products.options IS DISTINCT FROM EXCLUDED.options OR
    brand_products.image_urls IS DISTINCT FROM EXCLUDED.image_urls OR
    brand_products.tags IS DISTINCT FROM EXCLUDED.tags OR
    brand_products.category_gid IS DISTINCT FROM EXCLUDED.category_gid OR
    brand_products.metafields IS DISTINCT FROM EXCLUDED.metafields
  RETURNING id, (xmax = 0) AS inserted
`;

const UPSERT_BRAND_VARIANT_SQL = `
  INSERT INTO brand_product_variants
    (brand_product_id, shopify_variant_gid, title, sku, price, compare_at_price, inventory_quantity, inventory_item_gid, image_url, option_values, weight_value, weight_unit)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (brand_product_id, shopify_variant_gid) DO UPDATE SET
    title = EXCLUDED.title,
    sku = EXCLUDED.sku,
    price = EXCLUDED.price,
    compare_at_price = EXCLUDED.compare_at_price,
    inventory_quantity = EXCLUDED.inventory_quantity,
    inventory_item_gid = EXCLUDED.inventory_item_gid,
    image_url = EXCLUDED.image_url,
    option_values = EXCLUDED.option_values,
    weight_value = EXCLUDED.weight_value,
    weight_unit = EXCLUDED.weight_unit
`;

async function upsertBrandProduct(client, brandId, platformConnectionId, product) {
  const { rows } = await client.query(UPSERT_BRAND_PRODUCT_SQL, [
    brandId,
    platformConnectionId,
    product.shopifyProductGid,
    product.title,
    product.bodyHtml,
    product.handle,
    product.productType,
    product.vendor,
    product.status,
    JSON.stringify(product.options),
    JSON.stringify(product.imageUrls),
    JSON.stringify(product.tags),
    product.categoryGid,
    product.categoryName,
    JSON.stringify(product.metafields),
    JSON.stringify(product.raw),
  ]);

  const outcome = classifyUpsertResult(rows);
  let productId = rows[0]?.id;
  if (!productId) {
    const { rows: existing } = await client.query(
      'SELECT id FROM brand_products WHERE brand_id = $1 AND shopify_product_gid = $2',
      [brandId, product.shopifyProductGid]
    );
    productId = existing[0].id;
  }

  for (const variant of product.variants) {
    await client.query(UPSERT_BRAND_VARIANT_SQL, [
      productId,
      variant.shopifyVariantGid,
      variant.title,
      variant.sku,
      variant.price,
      variant.compareAtPrice,
      variant.inventoryQuantity,
      variant.inventoryItemGid,
      variant.imageUrl,
      JSON.stringify(variant.optionValues),
      variant.weightValue,
      variant.weightUnit,
    ]);
  }

  return outcome;
}

// Runs a full product+variant sync for one brand's connected Shopify store.
// If `jobId` is passed (the OAuth callback pre-creates a 'pending' row so
// Step 9 has something to poll immediately), that row is updated in place;
// otherwise a fresh product_sync_jobs row is created (the staff-triggered
// manual re-sync path).
export async function syncBrandProducts({ brandId, platformConnectionId, accessToken, shopDomain, jobId = null }) {
  const client = await getPool().connect();
  let effectiveJobId = jobId;

  try {
    if (effectiveJobId) {
      await client.query(`UPDATE product_sync_jobs SET status = 'running', started_at = now() WHERE id = $1`, [
        effectiveJobId,
      ]);
    } else {
      const { rows } = await client.query(
        `INSERT INTO product_sync_jobs (brand_id, platform_connection_id, status, triggered_by, started_at)
         VALUES ($1, $2, 'running', 'manual', now()) RETURNING id`,
        [brandId, platformConnectionId]
      );
      effectiveJobId = rows[0].id;
    }

    const results = [];
    let after = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const data = await brandShopifyGraphql({
        shopDomain,
        accessToken,
        query: BRAND_PRODUCTS_QUERY,
        // Only pull a brand's currently-active listings — draft/archived
        // products in their store aren't meant to be sold yet and shouldn't
        // end up pushed into la-diesse's catalogue.
        variables: { first: PAGE_SIZE, after, query: 'status:active' },
      });
      const { edges, pageInfo } = data.products;

      for (const edge of edges) {
        const product = extractBrandProductNode(edge.node);
        results.push(await upsertBrandProduct(client, brandId, platformConnectionId, product));
      }

      hasNextPage = pageInfo.hasNextPage;
      after = pageInfo.endCursor;
    }

    const summary = summarizeResults(results);
    await client.query(
      `UPDATE product_sync_jobs
       SET status = 'completed', completed_at = now(),
           products_created = $1, products_updated = $2, products_unchanged = $3
       WHERE id = $4`,
      [summary.created, summary.updated, summary.unchanged, effectiveJobId]
    );
    return summary;
  } catch (err) {
    if (effectiveJobId) {
      await client
        .query(
          `UPDATE product_sync_jobs SET status = 'failed', completed_at = now(), error_message = $1 WHERE id = $2`,
          [err.message, effectiveJobId]
        )
        .catch(() => {}); // best-effort — don't mask the original error if this also fails
    }
    throw err;
  } finally {
    client.release();
  }
}
