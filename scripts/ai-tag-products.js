// One-time (or resumable) bulk pass that replaces the manual Ipek/Sino
// tagging workflow: AI-tags every product that doesn't have a full set of
// tags yet, so the catalog goes from 0% tagged to fully AI-tagged, ready for
// a human review pass in the UI (which then flips tagged_by to 'Sinem' as
// each category gets confirmed/edited).
//
// Usage:
//   npm run ai-tag              tags every product missing at least one
//                                category's values (safe to re-run — already
//                                fully-tagged products are skipped)
//   npm run ai-tag -- --force   re-tags every product, overwriting existing
//                                values including ones already reviewed by
//                                hand — use deliberately, not routinely
import { getPool } from '../lib/db.js';
import { generateProductTags } from '../lib/aiTagger.js';

const CONCURRENCY = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUntaggedProductIds(pool, force) {
  if (force) {
    const { rows } = await pool.query('SELECT id FROM products ORDER BY title');
    return rows.map((r) => r.id);
  }

  const { rows } = await pool.query(`
    SELECT p.id
    FROM products p
    WHERE EXISTS (
      SELECT 1 FROM product_tags pt
      WHERE pt.product_id = p.id AND array_length(pt.values, 1) IS NULL
    )
    ORDER BY p.title
  `);
  return rows.map((r) => r.id);
}

async function tagOneProduct(pool, categories, id, force) {
  const { rows: productRows } = await pool.query(
    'SELECT id, title, description, image_url FROM products WHERE id = $1',
    [id]
  );
  if (productRows.length === 0) return { id, status: 'skipped', reason: 'not found' };

  const tagsByCategory = await generateProductTags(productRows[0], categories);

  for (const category of categories) {
    const values = tagsByCategory[category.key] ?? [];
    if (!force) {
      // Never clobber a category a human already reviewed, even in a
      // --force-free bulk run that also happens to touch this product for
      // another still-empty category.
      const { rows: existing } = await pool.query(
        'SELECT tagged_by FROM product_tags WHERE product_id = $1 AND category_key = $2',
        [id, category.key]
      );
      if (existing[0]?.tagged_by === 'Sinem') continue;
    }
    await pool.query(
      `INSERT INTO product_tags (product_id, category_key, values, tagged_by, updated_at)
       VALUES ($1, $2, $3, 'AI', now())
       ON CONFLICT (product_id, category_key) DO UPDATE SET
         values = EXCLUDED.values,
         tagged_by = EXCLUDED.tagged_by,
         updated_at = now()`,
      [id, category.key, values]
    );
  }

  return { id, title: productRows[0].title, status: 'tagged' };
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let next = 0;

  async function runOne() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

async function main() {
  const force = process.argv.includes('--force');
  const pool = getPool();

  const { rows: categories } = await pool.query(
    'SELECT key, label, sub_label, is_multi, max_tags, values FROM tag_categories ORDER BY key'
  );
  if (categories.length === 0) {
    console.error('No tag_categories found — run `npm run migrate` first.');
    process.exit(1);
  }

  const ids = await fetchUntaggedProductIds(pool, force);
  if (ids.length === 0) {
    console.log('Nothing to tag — every product already has a full set of tags. Use --force to re-tag anyway.');
    await pool.end();
    return;
  }

  console.log(`Tagging ${ids.length} product(s) with AI${force ? ' (--force: overwriting existing tags)' : ''}...`);

  let done = 0;
  let failed = 0;

  await runWithConcurrency(ids, CONCURRENCY, async (id) => {
    try {
      const result = await tagOneProduct(pool, categories, id, force);
      done++;
      console.log(`[${done + failed}/${ids.length}] ${result.title ?? id} — tagged`);
    } catch (err) {
      failed++;
      console.error(`[${done + failed}/${ids.length}] ${id} — failed: ${err.message}`);
    }
    // Light pacing to stay well under Anthropic's default rate limits.
    await sleep(200);
  });

  console.log(`\nDone. Tagged ${done}, failed ${failed}, out of ${ids.length}.`);
  if (failed > 0) {
    console.log('Re-run `npm run ai-tag` to retry failures — already-tagged products are skipped.');
  }
  await pool.end();
}

main().catch((err) => {
  console.error('AI tagging run failed:', err);
  process.exit(1);
});
