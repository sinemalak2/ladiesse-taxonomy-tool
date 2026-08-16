import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaggingPrompt, parseAiTagResponse } from '../lib/aiTagger.js';

const categories = [
  { key: 'body_shape', label: 'Body Shape', is_multi: true, max_tags: null, values: ['Hourglass', 'Pear'] },
  { key: 'occasion', label: 'Occasion', is_multi: true, max_tags: null, values: ['Party', 'Work'] },
  { key: 'vibe', label: 'Vibe', is_multi: true, max_tags: 3, values: ['Romantic', 'Edgy', 'Classic', 'Glam'] },
  { key: 'skin_tone', label: 'Skin Tone', is_multi: false, max_tags: null, values: ['Fair / Light', 'Tan'] },
];

describe('buildTaggingPrompt', () => {
  test('includes the product title and description', () => {
    const prompt = buildTaggingPrompt({ title: 'Silk Slip Dress', description: 'A flowy midi dress.' }, categories);
    assert.match(prompt, /Silk Slip Dress/);
    assert.match(prompt, /A flowy midi dress\./);
  });

  test('falls back to a placeholder when description is missing', () => {
    const prompt = buildTaggingPrompt({ title: 'Silk Slip Dress', description: null }, categories);
    assert.match(prompt, /\(none provided\)/);
  });

  test('lists every category with its allowed values and constraint', () => {
    const prompt = buildTaggingPrompt({ title: 'x', description: '' }, categories);
    assert.match(prompt, /"body_shape" \(choose any number that genuinely apply\): Hourglass, Pear/);
    assert.match(prompt, /"vibe" \(choose up to 3\): Romantic, Edgy, Classic, Glam/);
    assert.match(prompt, /"skin_tone" \(choose exactly 1\): Fair \/ Light, Tan/);
  });
});

describe('parseAiTagResponse', () => {
  test('parses a well-formed JSON response', () => {
    const text = '{"body_shape": ["Hourglass"], "occasion": ["Party"], "vibe": ["Romantic"], "skin_tone": ["Tan"]}';
    assert.deepEqual(parseAiTagResponse(text, categories), {
      body_shape: ['Hourglass'],
      occasion: ['Party'],
      vibe: ['Romantic'],
      skin_tone: ['Tan'],
    });
  });

  test('extracts JSON even when the model wraps it in prose', () => {
    const text = 'Sure, here you go:\n{"body_shape": ["Pear"], "occasion": [], "vibe": [], "skin_tone": []}\nHope that helps!';
    const result = parseAiTagResponse(text, categories);
    assert.deepEqual(result.body_shape, ['Pear']);
  });

  test('drops values not in the allowed list', () => {
    const text = '{"body_shape": ["Hourglass", "Made Up"], "occasion": [], "vibe": [], "skin_tone": []}';
    const result = parseAiTagResponse(text, categories);
    assert.deepEqual(result.body_shape, ['Hourglass']);
  });

  test('caps values at max_tags', () => {
    const text = '{"body_shape": [], "occasion": [], "vibe": ["Romantic", "Edgy", "Classic", "Glam"], "skin_tone": []}';
    const result = parseAiTagResponse(text, categories);
    assert.equal(result.vibe.length, 3);
  });

  test('keeps at most one value for a single-select category', () => {
    const text = '{"body_shape": [], "occasion": [], "vibe": [], "skin_tone": ["Fair / Light", "Tan"]}';
    const result = parseAiTagResponse(text, categories);
    assert.equal(result.skin_tone.length, 1);
  });

  test('missing categories default to an empty array', () => {
    const text = '{"body_shape": ["Hourglass"]}';
    const result = parseAiTagResponse(text, categories);
    assert.deepEqual(result.occasion, []);
    assert.deepEqual(result.vibe, []);
  });

  test('throws when no JSON object is present', () => {
    assert.throws(() => parseAiTagResponse('no json here', categories));
  });
});
