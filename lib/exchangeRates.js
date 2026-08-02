// Free, keyless FX rates via Frankfurter (ECB-sourced daily rates,
// https://frankfurter.dev) — used to convert a brand's own-store prices
// into la-diesse.myshopify.com's store currency when importing their
// catalogue. No API key, no paid dependency.
//
// Cached in-process for an hour so a full product sync doesn't hit this
// once per product — at most once per sync job, since the rate is fetched
// once and reused for every product in that run.

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map(); // `${from}_${to}` -> { rate, fetchedAt: Date }

export async function getExchangeRate(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) {
    return { rate: 1, fetchedAt: new Date() };
  }

  const cacheKey = `${fromCurrency}_${toCurrency}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  const res = await fetch(
    `https://api.frankfurter.dev/v1/latest?base=${fromCurrency}&symbols=${toCurrency}`
  );
  if (!res.ok) {
    throw new Error(`Exchange rate lookup failed (${res.status}) for ${fromCurrency} -> ${toCurrency}`);
  }

  const data = await res.json();
  const rate = data.rates?.[toCurrency];
  if (!rate) {
    throw new Error(`No exchange rate available for ${fromCurrency} -> ${toCurrency}`);
  }

  const result = { rate, fetchedAt: new Date() };
  cache.set(cacheKey, result);
  return result;
}

// Rounds to 2 decimal places — Shopify's Money type is a decimal string,
// and most storefront currencies (including USD/TRY) use 2 decimal places.
export function convertPrice(price, rate) {
  if (price == null) return null;
  return Math.round(price * rate * 100) / 100;
}
