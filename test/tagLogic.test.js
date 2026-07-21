import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toggleTagValue } from '../lib/tagLogic.js';

const vibeCategory = { is_multi: true, max_tags: 3 };
const bodyShapeCategory = { is_multi: true, max_tags: null };
const singleSelectCategory = { is_multi: false, max_tags: null };

describe('toggleTagValue', () => {
  test('adds a value when not selected', () => {
    assert.deepEqual(toggleTagValue([], 'Romantic', vibeCategory), ['Romantic']);
  });

  test('removes a value when already selected', () => {
    assert.deepEqual(toggleTagValue(['Romantic', 'Edgy'], 'Romantic', vibeCategory), ['Edgy']);
  });

  test('blocks adding past max_tags', () => {
    const atCap = ['Romantic', 'Edgy', 'Classic'];
    assert.deepEqual(toggleTagValue(atCap, 'Glam', vibeCategory), atCap);
  });

  test('allows unlimited values when max_tags is null', () => {
    const many = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual(toggleTagValue(many, 'f', bodyShapeCategory), [...many, 'f']);
  });

  test('replaces the value for single-select categories', () => {
    assert.deepEqual(toggleTagValue(['Fair / Light'], 'Tan', singleSelectCategory), ['Tan']);
  });
});
