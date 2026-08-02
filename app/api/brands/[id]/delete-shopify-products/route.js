import { NextResponse } from 'next/server';
import { deleteLadiesseImportedProducts } from '../../../../../lib/brandProductImport.js';

// Staff-only (protected by the existing session middleware). Deletes this
// brand's products from the LIVE la-diesse.myshopify.com store (via App A's
// client-credentials grant) and clears the imported_shopify_*_gid tracking
// columns, so a future import creates fresh products instead of trying to
// update ones that no longer exist. Distinct from delete-products/route.js,
// which only clears our own DB and never touches Shopify.
export async function POST(request, { params }) {
  const { id } = await params;

  try {
    const result = await deleteLadiesseImportedProducts({ brandId: id });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
