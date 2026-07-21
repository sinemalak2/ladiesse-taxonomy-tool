import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBulkDelete } from '../lib/productRemoval.js';

describe('summarizeBulkDelete', () => {
  test('counts all as succeeded when nothing fails', () => {
    const results = [
      { id: 'p1', title: 'A', ok: true },
      { id: 'p2', title: 'B', ok: true },
    ];
    assert.deepEqual(summarizeBulkDelete(results), { total: 2, succeeded: 2, failed: [] });
  });

  test('separates failures with their error message', () => {
    const results = [
      { id: 'p1', title: 'A', ok: true },
      { id: 'p2', title: 'B', ok: false, error: 'Shopify productDelete failed: not found' },
    ];
    assert.deepEqual(summarizeBulkDelete(results), {
      total: 2,
      succeeded: 1,
      failed: [{ id: 'p2', title: 'B', error: 'Shopify productDelete failed: not found' }],
    });
  });

  test('handles an empty batch', () => {
    assert.deepEqual(summarizeBulkDelete([]), { total: 0, succeeded: 0, failed: [] });
  });
});
