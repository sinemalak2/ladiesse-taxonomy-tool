import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chunk } from '../lib/shopifyPublish.js';

describe('chunk', () => {
  test('splits an array into groups of the given size', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });

  test('returns one chunk when everything fits', () => {
    assert.deepEqual(chunk([1, 2], 25), [[1, 2]]);
  });

  test('returns an empty array for empty input', () => {
    assert.deepEqual(chunk([], 25), []);
  });
});
