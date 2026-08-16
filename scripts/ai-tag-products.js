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
import { applyAiTags, findUntaggedProductIds } from '../lib/aiTagger.js';

const CONCURRENCY = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const queryFn = (text, params) => pool.query(text, params);

  const { rows: categories } = await pool.query(
    'SELECT key, label, sub_label, is_multi, max_tags, values FROM tag_categories ORDER BY key'
  );
  if (categories.length === 0) {
    console.error('No tag_categories found — run `npm run migrate` first.');
    process.exit(1);
  }

  const ids = force
    ? (await pool.query('SELECT id FROM products ORDER BY title')).rows.map((r) => r.id)
    : await findUntaggedProductIds(queryFn);

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
      const { rows: productRows } = await pool.query(
        'SELECT id, title, description, image_url FROM products WHERE id = $1',
        [id]
      );
      await applyAiTags(queryFn, productRows[0], categories, { force });
      done++;
      console.log(`[${done + failed}/${ids.length}] ${productRows[0].title} — tagged`);
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
