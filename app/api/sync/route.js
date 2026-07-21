import { NextResponse } from 'next/server';
import { syncShopifyProducts } from '../../../lib/sync.js';

async function runSync() {
  const summary = await syncShopifyProducts();
  console.log('Shopify sync complete:', summary);
  return NextResponse.json({ ok: true, ...summary });
}

// Manual "Sync now" button in the UI.
export async function POST() {
  try {
    return await runSync();
  } catch (err) {
    console.error('Sync failed:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// Vercel Cron invokes this on a schedule (see vercel.json). Cron requests
// carry `Authorization: Bearer $CRON_SECRET` — reject anything else so this
// endpoint can't be triggered anonymously via a plain GET.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return await runSync();
  } catch (err) {
    console.error('Scheduled sync failed:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
