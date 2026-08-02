import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db.js';
import { decryptToken } from '../../../../lib/brandTokenEncryption.js';
import {
  verifyWebhookHmac,
  toProductGid,
  toVariantGid,
  toInventoryItemGid,
  extractRestOptionValues,
  toGraphqlWeightUnit,
} from '../../../../lib/brandShopify.js';

// Keeps each brand's catalogue live between wizard syncs — Shopify calls
// this directly (no browser, no session), so it authenticates via its own
// HMAC signature on the raw request body rather than a cookie. Excluded
// from the brand/staff session middleware check entirely (see middleware.js).
export async function POST(request) {
  const rawBody = await request.text(); // signature covers raw bytes, not the parsed object
  const clientSecret = process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_SECRET;

  if (!clientSecret || !verifyWebhookHmac(rawBody, request.headers.get('x-shopify-hmac-sha256'), clientSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  const shopDomain = request.headers.get('x-shopify-shop-domain');
  const topic = request.headers.get('x-shopify-topic');
  if (!shopDomain || !topic) {
    return NextResponse.json({ error: 'Missing Shopify headers' }, { status: 400 });
  }

  const { rows: connRows } = await query(
    `SELECT id AS connection_id, brand_id, access_token_ref
     FROM brand_platform_connections
     WHERE shop_domain = $1 AND platform = 'shopify' AND status = 'active'
     LIMIT 1`,
    [shopDomain]
  );
  // Unknown/disconnected shop — nothing to do, but still 200 so Shopify
  // doesn't keep retrying a webhook we'll never be able to act on.
  if (connRows.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'unknown_shop' });
  }
  const { brand_id: brandId } = connRows[0];

  const body = JSON.parse(rawBody);

  switch (topic) {
    case 'products/create':
    case 'products/update':
      await upsertWebhookProduct(brandId, connRows[0].connection_id, body);
      break;

    case 'products/delete':
      await query(
        'DELETE FROM brand_products WHERE brand_id = $1 AND shopify_product_gid = $2',
        [brandId, toProductGid(body.id)]
      );
      break;

    case 'inventory_levels/update':
      await updateInventoryLevel(brandId, shopDomain, decryptToken(connRows[0].access_token_ref), body);
      break;

    default:
      // Registered topics are the only ones we should receive; anything
      // else is a no-op rather than an error.
      break;
  }

  return NextResponse.json({ ok: true });
}

async function upsertWebhookProduct(brandId, platformConnectionId, payload) {
  const options = (payload.options ?? []).map((o) => ({ name: o.name, values: o.values }));
  const imageUrls = (payload.images ?? []).map((img) => img.src);
  // REST's `tags` is a single comma-separated string, unlike GraphQL's plain
  // string array — normalized to the same array shape either path writes.
  const tags = payload.tags ? payload.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  const { rows } = await query(
    `INSERT INTO brand_products
       (brand_id, platform_connection_id, shopify_product_gid, title, body_html, handle, product_type, vendor, status, options, image_urls, tags, raw_shopify_data, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
     ON CONFLICT (brand_id, shopify_product_gid) DO UPDATE SET
       title = EXCLUDED.title, body_html = EXCLUDED.body_html, handle = EXCLUDED.handle,
       product_type = EXCLUDED.product_type, vendor = EXCLUDED.vendor, status = EXCLUDED.status,
       options = EXCLUDED.options, image_urls = EXCLUDED.image_urls, tags = EXCLUDED.tags,
       -- category and metafields aren't in the REST product webhook payload
       -- at all — preserved from whatever the last full GraphQL pull-sync
       -- set, rather than being wiped out just because this update didn't
       -- carry them.
       raw_shopify_data = EXCLUDED.raw_shopify_data, synced_at = now()
     RETURNING id`,
    [
      brandId,
      platformConnectionId,
      toProductGid(payload.id),
      payload.title,
      payload.body_html ?? null,
      payload.handle ?? null,
      payload.product_type ?? null,
      payload.vendor ?? null,
      payload.status ?? null,
      JSON.stringify(options),
      JSON.stringify(imageUrls),
      JSON.stringify(tags),
      JSON.stringify(payload),
    ]
  );
  const productId = rows[0].id;
  const featuredImageUrl = payload.image?.src ?? null;

  for (const variant of payload.variants ?? []) {
    const variantImage = (payload.images ?? []).find((img) => img.id === variant.image_id);
    await query(
      `INSERT INTO brand_product_variants
         (brand_product_id, shopify_variant_gid, title, sku, price, compare_at_price, inventory_quantity, inventory_item_gid, image_url, option_values, weight_value, weight_unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (brand_product_id, shopify_variant_gid) DO UPDATE SET
         title = EXCLUDED.title, sku = EXCLUDED.sku, price = EXCLUDED.price,
         compare_at_price = EXCLUDED.compare_at_price, inventory_quantity = EXCLUDED.inventory_quantity,
         inventory_item_gid = EXCLUDED.inventory_item_gid, image_url = EXCLUDED.image_url,
         option_values = EXCLUDED.option_values, weight_value = EXCLUDED.weight_value,
         weight_unit = EXCLUDED.weight_unit`,
      [
        productId,
        toVariantGid(variant.id),
        variant.title,
        variant.sku ?? null,
        variant.price != null ? Number(variant.price) : null,
        variant.compare_at_price != null ? Number(variant.compare_at_price) : null,
        variant.inventory_quantity ?? 0,
        toInventoryItemGid(variant.inventory_item_id),
        variantImage?.src ?? featuredImageUrl,
        JSON.stringify(extractRestOptionValues(payload.options, variant)),
        // REST keeps weight flat on the variant, unlike GraphQL's nested
        // inventoryItem.measurement.weight — different shape, same data.
        variant.weight ?? null,
        toGraphqlWeightUnit(variant.weight_unit),
      ]
    );
  }
}

// Single-warehouse assumption (per product design): Ladiesse only cares
// whether an item is in-stock and shippable from the one warehouse address
// a brand gave us, not per-location detail — so pool `available` across
// every location Shopify reports for this inventory item, rather than
// trusting just the one location this particular webhook event names.
async function updateInventoryLevel(brandId, shopDomain, accessToken, payload) {
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';
  const res = await fetch(
    `https://${shopDomain}/admin/api/${apiVersion}/inventory_levels.json?inventory_item_ids=${payload.inventory_item_id}`,
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  );
  if (!res.ok) throw new Error(`Failed to fetch inventory levels: ${res.status}`);
  const { inventory_levels: levels } = await res.json();
  const totalAvailable = (levels ?? []).reduce((sum, level) => sum + (level.available ?? 0), 0);

  await query(
    `UPDATE brand_product_variants v
     SET inventory_quantity = $1
     FROM brand_products p
     WHERE v.brand_product_id = p.id AND p.brand_id = $2 AND v.inventory_item_gid = $3`,
    [totalAvailable, brandId, toInventoryItemGid(payload.inventory_item_id)]
  );
}
