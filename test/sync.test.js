import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyUpsertResult, summarizeResults } from '../lib/sync.js';

describe('classifyUpsertResult', () => {
  test('returns unchanged when no row is returned', () => {
    assert.equal(classifyUpsertResult([]), 'unchanged');
  });

  test('returns created when the row was inserted', () => {
    assert.equal(classifyUpsertResult([{ inserted: true }]), 'created');
  });

  test('returns updated when the row was updated', () => {
    assert.equal(classifyUpsertResult([{ inserted: false }]), 'updated');
  });
});

describe('summarizeResults', () => {
  test('counts each outcome', () => {
    const summary = summarizeResults(['created', 'created', 'updated', 'unchanged', 'unchanged', 'unchanged']);
    assert.deepEqual(summary, { created: 2, updated: 1, unchanged: 3 });
  });

  test('handles an empty list', () => {
    assert.deepEqual(summarizeResults([]), { created: 0, updated: 0, unchanged: 0 });
  });
});
