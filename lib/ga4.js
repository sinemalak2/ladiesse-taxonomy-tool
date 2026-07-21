import { BigQuery } from '@google-cloud/bigquery';
import { getPool } from './db.js';

let bigquery;

function getBigQueryClient() {
  if (!bigquery) {
    // Locally, GOOGLE_APPLICATION_CREDENTIALS (a file path) is enough — the
    // client picks it up on its own. Vercel has no persistent filesystem to
    // point a path at, so production instead sets GA4_BQ_CREDENTIALS_JSON to
    // the service account key's raw JSON contents.
    const credentialsJson = process.env.GA4_BQ_CREDENTIALS_JSON;
    const options = { projectId: process.env.GA4_BQ_PROJECT_ID };
    if (credentialsJson) {
      options.credentials = JSON.parse(credentialsJson);
    }
    bigquery = new BigQuery(options);
  }
  return bigquery;
}

// GA4 event name -> our internal user_events.event_type.
const EVENT_NAME_MAP = {
  view_item: 'view',
  add_to_cart: 'add_to_cart',
  purchase: 'purchase',
  search: 'search',
};

export const TRACKED_EVENT_NAMES = Object.keys(EVENT_NAME_MAP);

// Verified against real BigQuery export data (2026-07-21): Shopify's GA4
// integration sets items[].item_id to "shopify_<COUNTRY>_<PRODUCT_ID>_<VARIANT_ID>"
// (e.g. "shopify_US_8569252413636_46049191755972"), not a bare product ID or
// GID. The embedded PRODUCT_ID matches products.id's numeric suffix exactly
// (confirmed by joining a sample against Postgres) — toProductGid()
// reconstructs the GID from it. `search_term` is confirmed as the right
// event param name.
const SHOPIFY_ITEM_ID_PATTERN = /^shopify_[a-z]{2}_(\d+)_(\d+)$/i;

export function toProductGid(itemId) {
  if (!itemId) return null;
  const match = itemId.match(SHOPIFY_ITEM_ID_PATTERN);
  return match ? `gid://shopify/Product/${match[1]}` : itemId;
}

export function buildEventsQuery({ projectId, dataset, date }) {
  const table = `\`${projectId}.${dataset}.events_${date.replace(/-/g, '')}\``;
  const eventNames = TRACKED_EVENT_NAMES.map((name) => `'${name}'`).join(', ');

  return `
    SELECT
      event_name,
      event_timestamp,
      user_id,
      user_pseudo_id,
      item.item_id AS item_id,
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'search_term') AS search_term
    FROM ${table}
    LEFT JOIN UNNEST(items) AS item
    WHERE event_name IN (${eventNames})
  `;
}

export function normalizeGa4Row(row) {
  return {
    user_key: row.user_id || row.user_pseudo_id,
    is_identified: Boolean(row.user_id),
    product_id: toProductGid(row.item_id),
    event_type: EVENT_NAME_MAP[row.event_name],
    search_query: row.event_name === 'search' ? row.search_term : null,
    occurred_at: new Date(Number(row.event_timestamp) / 1000), // GA4 export uses microseconds
  };
}

// date: 'YYYY-MM-DD', matching the events_YYYYMMDD table GA4's daily export creates.
export async function fetchGa4Events(date) {
  const projectId = process.env.GA4_BQ_PROJECT_ID;
  const dataset = process.env.GA4_BQ_DATASET;

  if (!projectId || !dataset) {
    throw new Error('GA4_BQ_PROJECT_ID and GA4_BQ_DATASET must be set');
  }

  const client = getBigQueryClient();
  const [rows] = await client.query({ query: buildEventsQuery({ projectId, dataset, date }) });

  return rows.map(normalizeGa4Row).filter((event) => event.user_key);
}

export function defaultIngestionDate() {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

// Matches the user_events_dedupe_idx expression index in db/schema.sql —
// the ON CONFLICT target has to reference the exact same expressions.
const INSERT_EVENT_SQL = `
  INSERT INTO user_events (user_key, is_identified, product_id, event_type, search_query, occurred_at)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (user_key, COALESCE(product_id, ''), event_type, occurred_at, COALESCE(search_query, ''))
  DO NOTHING
  RETURNING id
`;

// Fetches one day's GA4 events and inserts them into user_events. Safe to
// re-run — duplicates are silently skipped via the dedupe index above.
// Shared by scripts/ingest-ga4.js (manual/backfill) and
// app/api/ingest-ga4/route.js (nightly cron).
export async function ingestGa4Events(date) {
  const events = await fetchGa4Events(date);
  const pool = getPool();
  const inserted = {};
  const skipped = {};

  for (const event of events) {
    const { rows } = await pool.query(INSERT_EVENT_SQL, [
      event.user_key,
      event.is_identified,
      event.product_id,
      event.event_type,
      event.search_query,
      event.occurred_at,
    ]);
    const bucket = rows.length > 0 ? inserted : skipped;
    bucket[event.event_type] = (bucket[event.event_type] || 0) + 1;
  }

  return { date, fetched: events.length, inserted, skipped };
}
