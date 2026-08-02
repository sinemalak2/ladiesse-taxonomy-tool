import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  extractBrandProductNode,
  toProductGid,
  toVariantGid,
  toInventoryItemGid,
  verifyWebhookHmac,
  extractRestOptionValues,
  toGraphqlWeightUnit,
} from '../lib/brandShopify.js';

describe('GID conversion helpers', () => {
  test('toProductGid formats a numeric ID', () => {
    assert.equal(toProductGid(12345), 'gid://shopify/Product/12345');
  });

  test('toVariantGid formats a numeric ID', () => {
    assert.equal(toVariantGid(67890), 'gid://shopify/ProductVariant/67890');
  });

  test('toInventoryItemGid formats a numeric ID', () => {
    assert.equal(toInventoryItemGid(111), 'gid://shopify/InventoryItem/111');
  });
});

describe('verifyWebhookHmac', () => {
  const secret = 'webhook-secret';
  const rawBody = '{"id":123,"title":"Test Product"}';

  test('accepts a correctly signed body', () => {
    const hmac = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    assert.equal(verifyWebhookHmac(rawBody, hmac, secret), true);
  });

  test('rejects a tampered body', () => {
    const hmac = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    assert.equal(verifyWebhookHmac('{"id":999,"title":"Tampered"}', hmac, secret), false);
  });

  test('rejects a missing header', () => {
    assert.equal(verifyWebhookHmac(rawBody, null, secret), false);
  });
});

describe('extractRestOptionValues', () => {
  const productOptions = [
    { name: 'Size', values: ['S', 'M'] },
    { name: 'Color', values: ['Black', 'White'] },
  ];

  test('maps option1/option2 positionally to their option names', () => {
    const variant = { option1: 'M', option2: 'Black', option3: null };
    assert.deepEqual(extractRestOptionValues(productOptions, variant), [
      { name: 'Size', value: 'M' },
      { name: 'Color', value: 'Black' },
    ]);
  });

  test('handles a single-option product', () => {
    const variant = { option1: 'M', option2: null, option3: null };
    assert.deepEqual(extractRestOptionValues([{ name: 'Size', values: ['M'] }], variant), [
      { name: 'Size', value: 'M' },
    ]);
  });

  test('returns an empty array when there are no options', () => {
    assert.deepEqual(extractRestOptionValues([], { option1: null, option2: null, option3: null }), []);
  });
});

describe('toGraphqlWeightUnit', () => {
  test('maps REST short codes to GraphQL enum values', () => {
    assert.equal(toGraphqlWeightUnit('kg'), 'KILOGRAMS');
    assert.equal(toGraphqlWeightUnit('g'), 'GRAMS');
    assert.equal(toGraphqlWeightUnit('lb'), 'POUNDS');
    assert.equal(toGraphqlWeightUnit('oz'), 'OUNCES');
  });

  test('is case-insensitive', () => {
    assert.equal(toGraphqlWeightUnit('KG'), 'KILOGRAMS');
  });

  test('returns null for missing or unknown units', () => {
    assert.equal(toGraphqlWeightUnit(null), null);
    assert.equal(toGraphqlWeightUnit('stone'), null);
  });
});

describe('extractBrandProductNode', () => {
  test('extracts product fields and maps variants', () => {
    const node = {
      id: 'gid://shopify/Product/1',
      title: 'Test Dress',
      handle: 'test-dress',
      bodyHtml: '<p>desc</p>',
      productType: 'Dress',
      vendor: 'Test Brand',
      status: 'ACTIVE',
      options: [{ name: 'Size', values: ['Small'] }],
      tags: ['summer', 'floral'],
      category: { id: 'gid://shopify/TaxonomyCategory/aa-1', name: 'Dresses', fullName: 'Apparel & Accessories > Clothing > Dresses' },
      metafields: {
        edges: [{ node: { namespace: 'custom', key: 'fabric', value: 'cotton', type: 'single_line_text_field' } }],
      },
      featuredImage: { url: 'https://example.com/featured.jpg' },
      images: { edges: [{ node: { url: 'https://example.com/1.jpg' } }, { node: { url: 'https://example.com/2.jpg' } }] },
      variants: {
        edges: [
          {
            node: {
              id: 'gid://shopify/ProductVariant/1',
              title: 'Small',
              sku: 'SKU-1',
              price: '49.99',
              compareAtPrice: '59.99',
              inventoryQuantity: 5,
              inventoryItem: {
                id: 'gid://shopify/InventoryItem/1',
                measurement: { weight: { value: 0.5, unit: 'KILOGRAMS' } },
              },
              image: null,
              selectedOptions: [{ name: 'Size', value: 'Small' }],
            },
          },
        ],
      },
    };

    const result = extractBrandProductNode(node);
    assert.equal(result.shopifyProductGid, 'gid://shopify/Product/1');
    assert.equal(result.status, 'active');
    assert.deepEqual(result.options, [{ name: 'Size', values: ['Small'] }]);
    assert.deepEqual(result.imageUrls, ['https://example.com/1.jpg', 'https://example.com/2.jpg']);
    assert.equal(result.variants.length, 1);
    assert.equal(result.variants[0].price, 49.99);
    assert.equal(result.variants[0].compareAtPrice, 59.99);
    // Falls back to the product's featured image when the variant has none.
    assert.equal(result.variants[0].imageUrl, 'https://example.com/featured.jpg');
    assert.equal(result.variants[0].inventoryItemGid, 'gid://shopify/InventoryItem/1');
    assert.deepEqual(result.variants[0].optionValues, [{ name: 'Size', value: 'Small' }]);
    assert.equal(result.variants[0].weightValue, 0.5);
    assert.equal(result.variants[0].weightUnit, 'KILOGRAMS');
    assert.deepEqual(result.tags, ['summer', 'floral']);
    assert.equal(result.categoryGid, 'gid://shopify/TaxonomyCategory/aa-1');
    assert.equal(result.categoryName, 'Apparel & Accessories > Clothing > Dresses');
    assert.deepEqual(result.metafields, [
      { namespace: 'custom', key: 'fabric', value: 'cotton', type: 'single_line_text_field' },
    ]);
  });

  test('handles a product with no images or variants', () => {
    const node = {
      id: 'gid://shopify/Product/2',
      title: 'Empty Product',
      handle: 'empty',
      bodyHtml: null,
      productType: null,
      vendor: null,
      status: 'DRAFT',
      options: [],
      featuredImage: null,
      images: { edges: [] },
      variants: { edges: [] },
    };

    const result = extractBrandProductNode(node);
    assert.deepEqual(result.imageUrls, []);
    assert.deepEqual(result.variants, []);
    assert.deepEqual(result.options, []);
    assert.equal(result.status, 'draft');
    assert.deepEqual(result.tags, []);
    assert.equal(result.categoryGid, null);
    assert.deepEqual(result.metafields, []);
  });
});
