import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getExchangeRate, convertPrice } from '../lib/exchangeRates.js';

describe('getExchangeRate', () => {
  test('short-circuits when currencies match (no network call)', async () => {
    const originalFetch = global.fetch;
    global.fetch = () => {
      throw new Error('fetch should not be called for a same-currency lookup');
    };
    try {
      const result = await getExchangeRate('USD', 'USD');
      assert.equal(result.rate, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('fetches and caches a live rate', async () => {
    const originalFetch = global.fetch;
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({ amount: 1, base: 'USD', date: '2026-01-01', rates: { TRY: 41.5 } }),
      };
    };
    try {
      const first = await getExchangeRate('USD', 'TRY');
      assert.equal(first.rate, 41.5);
      assert.equal(callCount, 1);

      // Second call within the TTL window should hit the cache, not fetch again.
      const second = await getExchangeRate('USD', 'TRY');
      assert.equal(second.rate, 41.5);
      assert.equal(callCount, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('throws when the API responds with an error status', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 500 });
    try {
      await assert.rejects(() => getExchangeRate('EUR', 'GBP'));
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('throws when the requested currency is missing from the response', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ rates: {} }) });
    try {
      await assert.rejects(() => getExchangeRate('EUR', 'ZZZ'));
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('convertPrice', () => {
  test('applies the rate and rounds to 2 decimal places', () => {
    assert.equal(convertPrice(10, 41.5), 415);
    assert.equal(convertPrice(9.99, 1.0834), 10.82);
  });

  test('returns null for a null price', () => {
    assert.equal(convertPrice(null, 41.5), null);
  });

  test('is a no-op at rate 1', () => {
    assert.equal(convertPrice(49.99, 1), 49.99);
  });
});
