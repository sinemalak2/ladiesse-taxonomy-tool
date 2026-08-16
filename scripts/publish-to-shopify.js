// Bulk equivalent of clicking "Publish to Shopify" on every tagged
// product's detail panel — writes each one's non-empty tag categories to
// Shopify as ladiesse_taxonomy metafields in one pass. Same as the
// "Publish all to Shopify" button in the UI; this is the CLI form.
import { getPool } from '../lib/db.js';
import { publishAllProductTags } from '../lib/shopifyPublish.js';

async function main() {
  console.log('Publishing all tagged products to Shopify...');
  const summary = await publishAllProductTags();

  console.log(
    `\nDone. ${summary.metafieldsPublished} metafield(s) published across ` +
      `${summary.productsConsidered} tagged product(s), ${summary.metafieldsFailed} failed.`
  );
  if (summary.errors.length > 0) {
    console.log('Errors:', summary.errors.slice(0, 10));
  }

  await getPool().end();
  process.exit(summary.metafieldsFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Bulk publish failed:', err);
  process.exit(1);
});
