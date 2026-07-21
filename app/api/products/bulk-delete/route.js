import { NextResponse } from 'next/server';
import { bulkDeleteMarkedProducts } from '../../../../lib/productRemoval.js';

// Deletes every product currently marked_for_removal, from Shopify and our
// local cache. One failure doesn't abort the rest of the batch — see
// lib/productRemoval.js.
export async function POST() {
  try {
    const summary = await bulkDeleteMarkedProducts();
    console.log('Bulk product delete complete:', summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('Bulk product delete failed:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
