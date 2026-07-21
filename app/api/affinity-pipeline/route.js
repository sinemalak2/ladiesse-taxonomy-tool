import { NextResponse } from 'next/server';
import { ingestGa4Events, defaultIngestionDate } from '../../../lib/ga4.js';
import { runAffinityAggregation } from '../../../lib/affinity.js';

// Vercel Cron invokes this nightly (see vercel.json), after GA4's BigQuery
// export for the previous day has landed. Runs ingestion then aggregation
// in one request — Step 5 has to run strictly after Step 3 anyway, so this
// avoids guessing at a safe timing gap between two separate cron schedules,
// and only costs one cron slot (Vercel's Hobby plan has historically capped
// the *number* of cron jobs, not just their frequency).
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get('date') || defaultIngestionDate();

  try {
    const ingestion = await ingestGa4Events(date);
    console.log('GA4 ingestion complete:', ingestion);

    const aggregation = await runAffinityAggregation();
    console.log('Affinity aggregation complete:', aggregation);

    return NextResponse.json({ ok: true, ingestion, aggregation });
  } catch (err) {
    console.error('Affinity pipeline failed:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
