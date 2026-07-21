// Stage 2 tuning constants — kept central so scoring changes are a one-line
// diff here, not a hunt through lib/affinity.js.

export const EVENT_WEIGHTS = {
  view: 1,
  search: 4,
  add_to_cart: 5,
  purchase: 10,
};

export const HALF_LIFE_DAYS = 30; // exponential recency decay
export const AGGREGATION_WINDOW_DAYS = 90; // how far back scripts/aggregate-affinity.js looks
export const COLD_START_MIN_EVENTS = 5; // below this, /api/users/:user_key/affinity returns []

// Shorthand/slang search terms that don't substring-match their tag value
// (e.g. "boho" vs "Bohemian"). Seed list — extend as real queries surface
// gaps in lib/affinity.js's matchSearchQueryToValues.
export const SEARCH_SYNONYMS = {
  boho: 'Bohemian',
};

export function decayFactor(daysAgo, halfLifeDays = HALF_LIFE_DAYS) {
  return Math.exp((-Math.LN2 * daysAgo) / halfLifeDays);
}
