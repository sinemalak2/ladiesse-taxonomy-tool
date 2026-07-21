import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parsePage } from '../lib/pagination.js';

describe('parsePage', () => {
  test('defaults to 1 for missing/invalid input', () => {
    assert.equal(parsePage(null), 1);
    assert.equal(parsePage(undefined), 1);
    assert.equal(parsePage('abc'), 1);
    assert.equal(parsePage('0'), 1);
    assert.equal(parsePage('-3'), 1);
  });

  test('parses a valid page number', () => {
    assert.equal(parsePage('4'), 4);
  });
});
