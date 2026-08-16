import { getPool } from './db.js';
import { shopifyGraphql, METAFIELDS_SET_MUTATION } from './shopify.js';
import { buildTaxonomyMetafields } from './metafields.js';

// Shopify's metafieldsSet mutation caps the number of metafields accepted
// per call — chunk rather than send the whole catalog's worth at once.
const METAFIELDS_PER_CALL = 25;

export function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Publishes every product that has at least one non-empty tag category,
// regardless of tagged_by — this is the bulk equivalent of clicking
// "Publish to Shopify" on each product's detail panel.
export async function publishAllProductTags() {
  const pool = getPool();

  const { rows: taggedProducts } = await pool.query(
    'SELECT DISTINCT product_id FROM product_tags WHERE array_length(values, 1) > 0'
  );

  const metafields = [];
  for (const { product_id: productId } of taggedProducts) {
    const { rows: tagRows } = await pool.query(
      'SELECT category_key, values FROM product_tags WHERE product_id = $1',
      [productId]
    );
    metafields.push(...buildTaxonomyMetafields(productId, tagRows));
  }

  let published = 0;
  let failed = 0;
  const errors = [];

  for (const batch of chunk(metafields, METAFIELDS_PER_CALL)) {
    try {
      const data = await shopifyGraphql(METAFIELDS_SET_MUTATION, { metafields: batch });
      const userErrors = data.metafieldsSet.userErrors;
      if (userErrors.length > 0) {
        failed += batch.length;
        errors.push(...userErrors.map((e) => e.message));
      } else {
        published += batch.length;
      }
    } catch (err) {
      failed += batch.length;
      errors.push(err.message);
    }
  }

  return {
    productsConsidered: taggedProducts.length,
    metafieldsPublished: published,
    metafieldsFailed: failed,
    errors,
  };
}
