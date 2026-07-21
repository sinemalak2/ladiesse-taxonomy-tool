import { NextResponse } from 'next/server';
import { deleteProduct } from '../../../../../lib/productRemoval.js';

// Immediate single-product delete — removes it from Shopify itself, then
// from our local cache. No undo once this succeeds.
export async function POST(request, { params }) {
  const { id } = await params;

  try {
    await deleteProduct(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Product delete failed:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
