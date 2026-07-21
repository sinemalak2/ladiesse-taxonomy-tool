import { getPool } from './db.js';
import { EVENT_WEIGHTS, SEARCH_SYNONYMS, AGGREGATION_WINDOW_DAYS, decayFactor } from './affinity-config.js';

function normalizeText(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, ''); // strip accents so "üçgen" ~ "ucgen"
}

// tag_categories.values entries can carry a translation in parens, e.g.
// "Triangle (Üçgen)" — match against the primary (pre-paren) term.
function primaryTerm(value) {
  return normalizeText(value.split('(')[0].trim());
}

// Simple keyword match: a search query hits a tag value if they share a
// substring (either direction, whole-query or per-token) or if a token is a
// known synonym (see SEARCH_SYNONYMS) for the value.
export function matchSearchQueryToValues(searchQuery, tagCategories) {
  if (!searchQuery) return [];

  const query = normalizeText(searchQuery);
  const tokens = query.split(/\s+/).filter(Boolean);
  const matches = [];

  for (const category of tagCategories) {
    for (const value of category.values) {
      const normalizedValue = primaryTerm(value);
      if (!normalizedValue) continue;

      const substringHit =
        normalizedValue.includes(query) ||
        query.includes(normalizedValue) ||
        tokens.some((t) => t.length >= 3 && normalizedValue.includes(t));

      const synonymHit = tokens.some(
        (t) => normalizeText(SEARCH_SYNONYMS[t] || '') === normalizedValue
      );

      if (substringHit || synonymHit) {
        matches.push({ category_key: category.key, attribute_value: value });
      }
    }
  }

  return matches;
}

// raw: Map<user_key, Map<category_key, Map<attribute_value, score>>>. Nested
// maps (not a joined string key) because attribute values like "Circle /
// Apple (Daire)" already contain spaces/slashes that would corrupt a
// delimiter-joined composite key.
function normalizeByCategory(raw) {
  const rows = [];

  for (const [userKey, byCategory] of raw) {
    for (const [categoryKey, byValue] of byCategory) {
      const max = Math.max(...byValue.values());
      for (const [attributeValue, score] of byValue) {
        rows.push({
          user_key: userKey,
          category_key: categoryKey,
          attribute_value: attributeValue,
          score: max > 0 ? score / max : 0,
        });
      }
    }
  }

  return rows;
}

// events: [{ user_key, product_id, event_type, search_query, occurred_at }]
// productTags: Map<product_id, [{ category_key, attribute_value }]>
// tagCategories: [{ key, values }]
// Returns [{ user_key, category_key, attribute_value, score }], normalized
// 0-1 within each (user_key, category_key) pair.
export function computeAffinityRows(events, { productTags, tagCategories, now = new Date() }) {
  const raw = new Map();

  const add = (userKey, categoryKey, attributeValue, weight) => {
    if (!raw.has(userKey)) raw.set(userKey, new Map());
    const byCategory = raw.get(userKey);
    if (!byCategory.has(categoryKey)) byCategory.set(categoryKey, new Map());
    const byValue = byCategory.get(categoryKey);
    byValue.set(attributeValue, (byValue.get(attributeValue) || 0) + weight);
  };

  for (const event of events) {
    const daysAgo = (now - new Date(event.occurred_at)) / (1000 * 60 * 60 * 24);
    if (daysAgo < 0) continue; // clock skew guard

    const weight = (EVENT_WEIGHTS[event.event_type] ?? 0) * decayFactor(daysAgo);
    if (weight <= 0) continue;

    if (event.event_type === 'search') {
      for (const match of matchSearchQueryToValues(event.search_query, tagCategories)) {
        add(event.user_key, match.category_key, match.attribute_value, weight);
      }
      continue;
    }

    const tags = productTags.get(event.product_id) || [];
    for (const tag of tags) {
      add(event.user_key, tag.category_key, tag.attribute_value, weight);
    }
  }

  return normalizeByCategory(raw);
}

const BATCH_SIZE = 500;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

// These three run concurrently via pool.query() (each grabs its own
// connection) rather than a single shared client — issuing concurrent
// queries on one client is deprecated in pg and unsafe.
async function loadEvents(pool) {
  const { rows } = await pool.query(
    `SELECT user_key, product_id, event_type, search_query, occurred_at
     FROM user_events
     WHERE occurred_at >= now() - ($1 || ' days')::interval`,
    [AGGREGATION_WINDOW_DAYS]
  );
  return rows;
}

async function loadProductTags(pool) {
  const { rows } = await pool.query('SELECT product_id, category_key, values FROM product_tags');
  const map = new Map();

  for (const row of rows) {
    const tags = row.values.map((value) => ({ category_key: row.category_key, attribute_value: value }));
    map.set(row.product_id, [...(map.get(row.product_id) || []), ...tags]);
  }

  return map;
}

async function loadTagCategories(pool) {
  const { rows } = await pool.query('SELECT key, values FROM tag_categories');
  return rows;
}

function buildInsertBatch(rows) {
  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = i * 4;
    values.push(row.user_key, row.category_key, row.attribute_value, row.score);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, now())`;
  });

  return {
    text: `INSERT INTO user_attribute_affinity (user_key, category_key, attribute_value, score, updated_at) VALUES ${placeholders.join(', ')}`,
    values,
  };
}

// Recomputes user_attribute_affinity from scratch from the rolling window
// (AGGREGATION_WINDOW_DAYS) and replaces it wholesale in a transaction,
// rather than upserting row-by-row, so attribute values that age out of the
// window don't linger as stale rows. Shared by scripts/aggregate-affinity.js
// (manual run) and app/api/aggregate-affinity/route.js (nightly cron).
export async function runAffinityAggregation() {
  const pool = getPool();

  const [events, productTags, tagCategories] = await Promise.all([
    loadEvents(pool),
    loadProductTags(pool),
    loadTagCategories(pool),
  ]);

  const userCount = new Set(events.map((e) => e.user_key)).size;
  const rows = computeAffinityRows(events, { productTags, tagCategories });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_attribute_affinity');
    for (const batch of chunk(rows, BATCH_SIZE)) {
      const { text, values } = buildInsertBatch(batch);
      await client.query(text, values);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { eventCount: events.length, userCount, rowCount: rows.length };
}
