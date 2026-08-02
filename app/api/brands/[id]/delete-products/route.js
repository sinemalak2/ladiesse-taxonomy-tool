import { NextResponse } from 'next/server';
import { deleteBrandProductsFromDb } from '../../../../../lib/brandProductImport.js';

// Staff-only (protected by the existing session middleware). Clears this
// brand's pulled catalogue from our DB only (never touches
// la-diesse.myshopify.com or the brand's own store) — for wiping stale test
// data so a re-sync starts clean.
export async function POST(request, { params }) {
  const { id } = await params;

  try {
    const result = await deleteBrandProductsFromDb({ brandId: id });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
