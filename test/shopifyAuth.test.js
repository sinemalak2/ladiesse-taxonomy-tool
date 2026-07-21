import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isTokenExpired } from '../lib/shopifyAuth.js';

describe('isTokenExpired', () => {
  test('is not expired well before expiry', () => {
    const now = 1_000_000;
    assert.equal(isTokenExpired(now + 10 * 60_000, now), false);
  });

  test('is expired within the refresh margin', () => {
    const now = 1_000_000;
    assert.equal(isTokenExpired(now + 30_000, now), true);
  });

  test('is expired once past expiry', () => {
    const now = 1_000_000;
    assert.equal(isTokenExpired(now - 1, now), true);
  });
});
