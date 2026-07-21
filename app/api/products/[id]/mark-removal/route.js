import { NextResponse } from 'next/server';
import { setMarkedForRemoval } from '../../../../../lib/productRemoval.js';

// Toggles the marked_for_removal flag only — no Shopify call. Actual
// deletion happens later via POST /api/products/bulk-delete.
export async function POST(request, { params }) {
  const { id } = await params;
  const { marked } = await request.json();

  await setMarkedForRemoval(id, marked);
  return NextResponse.json({ ok: true, marked: Boolean(marked) });
}
