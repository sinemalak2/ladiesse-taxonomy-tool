import { getPool } from './db.js';
import { shopifyGraphql, PRODUCTS_QUERY, extractProductNode } from './shopify.js';

const PAGE_SIZE = 50;

const UPSERT_PRODUCT_SQL = `
  INSERT INTO products (id, title, handle, image_url, price, status, raw_shopify_data, synced_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, now())
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    handle = EXCLUDED.handle,
    image_url = EXCLUDED.image_url,
    price = EXCLUDED.price,
    status = EXCLUDED.status,
    raw_shopify_data = EXCLUDED.raw_shopify_data,
    synced_at = now()
  WHERE
    products.title IS DISTINCT FROM EXCLUDED.title OR
    products.handle IS DISTINCT FROM EXCLUDED.handle OR
    products.image_url IS DISTINCT FROM EXCLUDED.image_url OR
    products.price IS DISTINCT FROM EXCLUDED.price OR
    products.status IS DISTINCT FROM EXCLUDED.status
  RETURNING (xmax = 0) AS inserted
`;

// Ensures every product has a placeholder row per current tag category, even
// for products synced before a category existed — safe to run on every sync.
const SEED_TAG_ROWS_SQL = `
  INSERT INTO product_tags (product_id, category_key)
  SELECT $1, key FROM tag_categories
  ON CONFLICT (product_id, category_key) DO NOTHING
`;

// rows: array of 0 or 1 pg result rows from UPSERT_PRODUCT_SQL for one product.
// Returns 'created' | 'updated' | 'unchanged'.
export function classifyUpsertResult(rows) {
  if (rows.length === 0) return 'unchanged';
  return rows[0].inserted ? 'created' : 'updated';
}

export function summarizeResults(results) {
  return results.reduce(
    (summary, outcome) => {
      summary[outcome] = (summary[outcome] || 0) + 1;
      return summary;
    },
    { created: 0, updated: 0, unchanged: 0 }
  );
}

async function upsertProduct(client, product) {
  const { rows } = await client.query(UPSERT_PRODUCT_SQL, [
    product.id,
    product.title,
    product.handle,
    product.imageUrl,
    product.price,
    product.status,
    JSON.stringify(product.raw),
  ]);
  await client.query(SEED_TAG_ROWS_SQL, [product.id]);
  return classifyUpsertResult(rows);
}

export async function syncShopifyProducts() {
  const pool = getPool();
  const client = await pool.connect();
  const results = [];

  try {
    let after = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const data = await shopifyGraphql(PRODUCTS_QUERY, { first: PAGE_SIZE, after });
      const { edges, pageInfo } = data.products;

      for (const edge of edges) {
        const product = extractProductNode(edge.node);
        results.push(await upsertProduct(client, product));
      }

      hasNextPage = pageInfo.hasNextPage;
      after = pageInfo.endCursor;
    }
  } finally {
    client.release();
  }

  return summarizeResults(results);
}
