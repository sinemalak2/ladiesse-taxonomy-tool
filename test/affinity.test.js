import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchSearchQueryToValues, computeAffinityRows } from '../lib/affinity.js';

const TAG_CATEGORIES = [
  { key: 'occasion', values: ['Wedding', 'Brunch', 'Everyday'] },
  { key: 'vibe', values: ['Romantic', 'Bohemian', 'Minimal'] },
  { key: 'body_shape', values: ['Circle / Apple (Rounded)', 'Triangle (3-Sided)'] },
];

describe('matchSearchQueryToValues', () => {
  test('returns nothing for an empty query', () => {
    assert.deepEqual(matchSearchQueryToValues('', TAG_CATEGORIES), []);
    assert.deepEqual(matchSearchQueryToValues(null, TAG_CATEGORIES), []);
  });

  test('substring-matches a plain term', () => {
    const matches = matchSearchQueryToValues('wedding dress', TAG_CATEGORIES);
    assert.deepEqual(matches, [{ category_key: 'occasion', attribute_value: 'Wedding' }]);
  });

  test('matches via the synonym map for shorthand terms', () => {
    const matches = matchSearchQueryToValues('boho dress', TAG_CATEGORIES);
    assert.deepEqual(matches, [{ category_key: 'vibe', attribute_value: 'Bohemian' }]);
  });

  test('matches against the primary (pre-paren) term only', () => {
    const matches = matchSearchQueryToValues('apple shape', TAG_CATEGORIES);
    assert.deepEqual(matches, [
      { category_key: 'body_shape', attribute_value: 'Circle / Apple (Rounded)' },
    ]);
  });

  test('returns no matches for an unrelated query', () => {
    assert.deepEqual(matchSearchQueryToValues('zzz nonsense', TAG_CATEGORIES), []);
  });
});

describe('computeAffinityRows', () => {
  const productTags = new Map([
    ['p1', [{ category_key: 'vibe', attribute_value: 'Romantic' }]],
    ['p2', [{ category_key: 'vibe', attribute_value: 'Bohemian' }]],
  ]);

  test('normalizes scores to 0-1 within a user + category, keyed to the max', () => {
    const now = new Date('2026-07-21T00:00:00Z');
    const events = [
      { user_key: 'u1', product_id: 'p1', event_type: 'view', search_query: null, occurred_at: now },
      { user_key: 'u1', product_id: 'p2', event_type: 'purchase', search_query: null, occurred_at: now },
    ];

    const rows = computeAffinityRows(events, { productTags, tagCategories: TAG_CATEGORIES, now });
    const romantic = rows.find((r) => r.attribute_value === 'Romantic');
    const bohemian = rows.find((r) => r.attribute_value === 'Bohemian');

    assert.equal(bohemian.score, 1); // purchase (weight 10) dominates
    assert.ok(romantic.score < bohemian.score);
  });

  test('older events contribute less due to recency decay', () => {
    const now = new Date('2026-07-21T00:00:00Z');
    const recent = new Date(now);
    const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

    const eventsRecent = [
      { user_key: 'u1', product_id: 'p1', event_type: 'view', search_query: null, occurred_at: recent },
    ];
    const eventsOld = [
      { user_key: 'u1', product_id: 'p1', event_type: 'view', search_query: null, occurred_at: old },
    ];

    // Compare against a second, undecayed attribute to read out relative weight.
    const withDecayed = computeAffinityRows(
      [...eventsOld, { user_key: 'u1', product_id: 'p2', event_type: 'view', search_query: null, occurred_at: recent }],
      { productTags, tagCategories: TAG_CATEGORIES, now }
    );
    const romantic = withDecayed.find((r) => r.attribute_value === 'Romantic');
    assert.ok(romantic.score < 1); // the 60-day-old view scores below the fresh one
  });

  test('search events contribute via keyword matching, not product tags', () => {
    const now = new Date('2026-07-21T00:00:00Z');
    const events = [
      { user_key: 'u1', product_id: null, event_type: 'search', search_query: 'boho', occurred_at: now },
    ];

    const rows = computeAffinityRows(events, { productTags, tagCategories: TAG_CATEGORIES, now });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].category_key, 'vibe');
    assert.equal(rows[0].attribute_value, 'Bohemian');
  });

  test('unknown event types and missing product tags contribute nothing', () => {
    const now = new Date('2026-07-21T00:00:00Z');
    const events = [
      { user_key: 'u1', product_id: 'unknown-product', event_type: 'view', search_query: null, occurred_at: now },
      { user_key: 'u1', product_id: 'p1', event_type: 'click', search_query: null, occurred_at: now },
    ];

    const rows = computeAffinityRows(events, { productTags, tagCategories: TAG_CATEGORIES, now });
    assert.deepEqual(rows, []);
  });
});
