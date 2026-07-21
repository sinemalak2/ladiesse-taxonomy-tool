import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toProductGid } from '../lib/ga4.js';

describe('toProductGid', () => {
  test('extracts the product GID from Shopify\'s GA4 item_id format', () => {
    // Real sample pulled from the ladiesse.com BigQuery export (2026-07-21).
    assert.equal(
      toProductGid('shopify_US_8569252413636_46049191755972'),
      'gid://shopify/Product/8569252413636'
    );
  });

  test('passes through an already-clean GID unchanged', () => {
    assert.equal(
      toProductGid('gid://shopify/Product/123'),
      'gid://shopify/Product/123'
    );
  });

  test('returns null for a missing item_id (e.g. search events)', () => {
    assert.equal(toProductGid(null), null);
    assert.equal(toProductGid(undefined), null);
  });
});
