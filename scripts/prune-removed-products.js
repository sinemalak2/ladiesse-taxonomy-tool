// One-time cleanup: delete products from our DB that no longer exist in
// Shopify. The regular sync (lib/sync.js) only ever upserts — it never
// deletes — so this is a separate, manual, opt-in script rather than
// something wired into the scheduled sync.
//
// Usage:
//   node scripts/prune-removed-products.js            (dry run — lists what would be deleted)
//   node scripts/prune-removed-products.js --confirm   (actually deletes)
import { getPool } from '../lib/db.js';
import { shopifyGraphql, PRODUCT_IDS_QUERY } from '../lib/shopify.js';

const PAGE_SIZE = 250;

async function fetchAllShopifyProductIds() {
  const ids = new Set();
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyGraphql(PRODUCT_IDS_QUERY, { first: PAGE_SIZE, after });
    const { edges, pageInfo } = data.products;
    for (const edge of edges) ids.add(edge.node.id);
    hasNextPage = pageInfo.hasNextPage;
    after = pageInfo.endCursor;
  }

  return ids;
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const pool = getPool();

  console.log('Fetching current product IDs from Shopify...');
  const shopifyIds = await fetchAllShopifyProductIds();
  console.log(`Shopify has ${shopifyIds.size} product(s).`);

  const { rows: dbProducts } = await pool.query('SELECT id, title, status FROM products ORDER BY title');
  const stale = dbProducts.filter((p) => !shopifyIds.has(p.id));

  if (stale.length === 0) {
    console.log('Every product in the database still exists in Shopify. Nothing to prune.');
    await pool.end();
    return;
  }

  console.log(`\n${stale.length} product(s) in the database no longer exist in Shopify:`);
  for (const p of stale) {
    console.log(`  - ${p.title} (${p.id}) [${p.status}]`);
  }

  if (!confirm) {
    console.log('\nDry run only — nothing deleted.');
    console.log('Re-run with --confirm to delete these rows (their tags & notes cascade automatically).');
    await pool.end();
    return;
  }

  const ids = stale.map((p) => p.id);
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [ids]);
  console.log(`\nDeleted ${ids.length} product(s) and their associated tags/notes.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Prune failed:', err);
  process.exit(1);
});
