import { NextResponse } from 'next/server';
import { publishAllProductTags } from '../../../../lib/shopifyPublish.js';

export const maxDuration = 60;

// Bulk equivalent of clicking "Publish to Shopify" on every tagged
// product's detail panel — writes each one's non-empty tag categories to
// Shopify as ladiesse_taxonomy metafields in one pass.
export async function POST() {
  try {
    const summary = await publishAllProductTags();
    console.log('Bulk publish to Shopify complete:', summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('Bulk publish to Shopify failed:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
