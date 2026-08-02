import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';
import { decryptToken } from '../../../../../lib/brandTokenEncryption.js';
import { syncBrandProducts } from '../../../../../lib/brandSync.js';
import { importBrandProductsToLadiesse } from '../../../../../lib/brandProductImport.js';

// Staff-only (protected by the existing session middleware) manual re-sync
// trigger — for pulling in catalogue changes outside of the once-per-brand
// wizard sync, or retrying after a failure. Runs both halves of the
// pipeline: pull from the brand's own store, then push into
// la-diesse.myshopify.com. Unlike the brand-facing wizard trigger, an
// import failure here IS surfaced — staff are the ones who'd need to act
// on it (e.g. granting a missing Shopify scope on our own store's app).
export async function POST(request, { params }) {
  const { id } = await params;

  const { rows } = await query(
    `SELECT id, shop_domain, access_token_ref FROM brand_platform_connections
     WHERE brand_id = $1 AND platform = 'shopify' AND status = 'active' LIMIT 1`,
    [id]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Brand has no active Shopify connection' }, { status: 400 });
  }
  const connection = rows[0];

  let pullSummary;
  try {
    pullSummary = await syncBrandProducts({
      brandId: id,
      platformConnectionId: connection.id,
      accessToken: decryptToken(connection.access_token_ref),
      shopDomain: connection.shop_domain,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  try {
    const importSummary = await importBrandProductsToLadiesse({ brandId: id });
    return NextResponse.json({ ok: true, pullSummary, importSummary });
  } catch (err) {
    return NextResponse.json({ ok: true, pullSummary, importError: err.message });
  }
}

// Lets the admin page show sync status without a full page reload.
export async function GET(request, { params }) {
  const { id } = await params;

  const { rows: pullRows } = await query(
    `SELECT status, products_created, products_updated, error_message, started_at, completed_at
     FROM product_sync_jobs WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id]
  );
  const { rows: importRows } = await query(
    `SELECT status, products_created, products_updated, error_message, started_at, completed_at
     FROM product_import_jobs WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id]
  );
  return NextResponse.json({ job: pullRows[0] || null, importJob: importRows[0] || null });
}
