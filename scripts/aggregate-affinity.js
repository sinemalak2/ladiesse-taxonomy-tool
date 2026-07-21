// Manual CLI wrapper around lib/affinity.js's runAffinityAggregation — see
// app/api/aggregate-affinity/route.js for the nightly cron-triggered version.
// Run after scripts/ingest-ga4.js (or npm run ingest-ga4).
import { getPool } from '../lib/db.js';
import { runAffinityAggregation } from '../lib/affinity.js';

async function main() {
  const result = await runAffinityAggregation();
  console.log(`Aggregated ${result.eventCount} event(s) across ${result.userCount} user(s).`);
  console.log(`Upserted ${result.rowCount} affinity row(s).`);
  await getPool().end();
}

main().catch((err) => {
  console.error('Affinity aggregation failed:', err);
  process.exit(1);
});
