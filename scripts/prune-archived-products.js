// The regular sync (lib/sync.js) excludes ARCHIVED products from Shopify
// entirely, so once a product gets archived in Shopify it stops being
// touched by sync — it just sits stale in our DB. This script finds and
// removes those, matching what's currently archived in Shopify.
//
// Usage:
//   node scripts/prune-archived-products.js            (dry run — lists what would be deleted)
//   node scripts/prune-archived-products.js --confirm   (actually deletes)
import { getPool } from '../lib/db.js';
import { shopifyGraphql } from '../lib/shopify.js';

const PAGE_SIZE = 250;

const ARCHIVED_IDS_QUERY = `
  query ArchivedProductIds($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:archived") {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
        }
      }
    }
  }
`;

async function fetchArchivedShopifyProductIds() {
  const ids = new Set();
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyGraphql(ARCHIVED_IDS_QUERY, { first: PAGE_SIZE, after });
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

  console.log('Fetching archived product IDs from Shopify...');
  const archivedIds = await fetchArchivedShopifyProductIds();
  console.log(`Shopify currently has ${archivedIds.size} archived product(s).`);

  const { rows: dbProducts } = await pool.query('SELECT id, title, status FROM products ORDER BY title');
  const stale = dbProducts.filter((p) => archivedIds.has(p.id));

  if (stale.length === 0) {
    console.log('No archived-in-Shopify products remain in the database. Nothing to prune.');
    await pool.end();
    return;
  }

  console.log(`\n${stale.length} product(s) in the database are archived in Shopify:`);
  for (const p of stale) {
    console.log(`  - ${p.title} (${p.id}) [cached status: ${p.status}]`);
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
