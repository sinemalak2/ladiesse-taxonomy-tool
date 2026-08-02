import { NextResponse } from 'next/server';
import { deleteLadiesseImportedProducts } from '../../../../../lib/brandProductImport.js';

// Staff-only (protected by the existing session middleware). Deletes this
// brand's products from la-diesse.myshopify.com — for cleaning up test
// imports, or removing a brand's catalogue without deleting the brand
// record itself (e.g. while it's paused/suspended).
export async function POST(request, { params }) {
  const { id } = await params;

  try {
    const result = await deleteLadiesseImportedProducts({ brandId: id });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
