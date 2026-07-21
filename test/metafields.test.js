import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaxonomyMetafields } from '../lib/metafields.js';

describe('buildTaxonomyMetafields', () => {
  test('skips categories with no tags', () => {
    const rows = [
      { category_key: 'body_shape', values: [] },
      { category_key: 'vibe', values: ['Romantic'] },
    ];
    const metafields = buildTaxonomyMetafields('gid://shopify/Product/1', rows);
    assert.equal(metafields.length, 1);
    assert.equal(metafields[0].key, 'vibe');
  });

  test('serializes values as a JSON list for list.single_line_text_field', () => {
    const rows = [{ category_key: 'vibe', values: ['Romantic', 'Edgy'] }];
    const [metafield] = buildTaxonomyMetafields('gid://shopify/Product/1', rows);
    assert.equal(metafield.namespace, 'ladiesse_taxonomy');
    assert.equal(metafield.type, 'list.single_line_text_field');
    assert.deepEqual(JSON.parse(metafield.value), ['Romantic', 'Edgy']);
  });
});
