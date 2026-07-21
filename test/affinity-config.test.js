import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decayFactor, HALF_LIFE_DAYS } from '../lib/affinity-config.js';

describe('decayFactor', () => {
  test('is 1 for an event with no elapsed time', () => {
    assert.equal(decayFactor(0), 1);
  });

  test('halves at the configured half-life', () => {
    assert.ok(Math.abs(decayFactor(HALF_LIFE_DAYS) - 0.5) < 1e-9);
  });

  test('quarters at twice the half-life', () => {
    assert.ok(Math.abs(decayFactor(HALF_LIFE_DAYS * 2) - 0.25) < 1e-9);
  });
});
