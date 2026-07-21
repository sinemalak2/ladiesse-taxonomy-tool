import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateTagValues } from '../lib/tagValidation.js';

const vibeCategory = { label: 'Vibe', max_tags: 3, values: ['Romantic', 'Edgy', 'Classic', 'Glam'] };

describe('validateTagValues', () => {
  test('rejects non-array values', () => {
    assert.match(validateTagValues('Romantic', vibeCategory), /must be an array/);
  });

  test('rejects too many values for a capped category', () => {
    const err = validateTagValues(['Romantic', 'Edgy', 'Classic', 'Glam'], vibeCategory);
    assert.match(err, /at most 3/);
  });

  test('rejects unknown values', () => {
    const err = validateTagValues(['Sparkly'], vibeCategory);
    assert.match(err, /Unknown value/);
  });

  test('accepts a valid selection within the cap', () => {
    assert.equal(validateTagValues(['Romantic', 'Edgy'], vibeCategory), null);
  });
});
