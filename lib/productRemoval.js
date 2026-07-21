import { getPool } from './db.js';
import { shopifyGraphql, PRODUCT_DELETE_MUTATION } from './shopify.js';

// Deletes a product on Shopify itself — this is the real, largely
// irreversible removal (no undo exposed via the Admin API once it runs).
async function deleteProductFromShopify(productId) {
  const data = await shopifyGraphql(PRODUCT_DELETE_MUTATION, { input: { id: productId } });
  const errors = data.productDelete?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Shopify productDelete failed: ${errors.map((e) => e.message).join(', ')}`);
  }
  return data.productDelete.deletedProductId;
}

// Deletes from Shopify first, then the local cache — product_tags and
// product_notes cascade automatically (ON DELETE CASCADE). If the local
// delete somehow fails after Shopify already succeeded, the row is at least
// still correct on next sync (excluded, since it no longer exists there).
export async function deleteProduct(productId) {
  await deleteProductFromShopify(productId);
  await getPool().query('DELETE FROM products WHERE id = $1', [productId]);
}

export async function setMarkedForRemoval(productId, marked) {
  await getPool().query('UPDATE products SET marked_for_removal = $1 WHERE id = $2', [
    Boolean(marked),
    productId,
  ]);
}

// results: [{ id, title, ok, error? }] — from bulkDeleteMarkedProducts.
export function summarizeBulkDelete(results) {
  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  return {
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.map((r) => ({ id: r.id, title: r.title, error: r.error })),
  };
}

// Deletes every product currently marked_for_removal, one at a time so one
// Shopify failure (e.g. a product already deleted elsewhere) doesn't abort
// the rest of the batch.
export async function bulkDeleteMarkedProducts() {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, title FROM products WHERE marked_for_removal = true ORDER BY title'
  );

  const results = [];
  for (const row of rows) {
    try {
      await deleteProduct(row.id);
      results.push({ id: row.id, title: row.title, ok: true });
    } catch (err) {
      results.push({ id: row.id, title: row.title, ok: false, error: err.message });
    }
  }

  return summarizeBulkDelete(results);
}
