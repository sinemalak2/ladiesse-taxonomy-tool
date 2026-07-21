// Manual/backfill CLI wrapper around lib/ga4.js's ingestGa4Events — see
// app/api/ingest-ga4/route.js for the nightly cron-triggered version.
//
// Usage:
//   node scripts/ingest-ga4.js                 (yesterday, UTC)
//   node scripts/ingest-ga4.js --date=2026-07-20
import { getPool } from '../lib/db.js';
import { ingestGa4Events, defaultIngestionDate } from '../lib/ga4.js';

function parseDateArg(argv) {
  const arg = argv.find((a) => a.startsWith('--date='));
  return arg ? arg.split('=')[1] : defaultIngestionDate();
}

async function main() {
  const date = parseDateArg(process.argv.slice(2));
  console.log(`Ingesting GA4 events for ${date}...`);

  const result = await ingestGa4Events(date);

  console.log(`Fetched ${result.fetched} event(s) from GA4.`);
  console.log('New rows inserted:', result.inserted);
  console.log('Already present (deduped):', result.skipped);
  await getPool().end();
}

main().catch((err) => {
  console.error('GA4 ingestion failed:', err);
  process.exit(1);
});
