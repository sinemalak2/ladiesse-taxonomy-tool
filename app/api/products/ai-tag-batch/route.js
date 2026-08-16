import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db.js';
import { applyAiTags, findUntaggedProductIds, countUntaggedProducts } from '../../../../lib/aiTagger.js';

// Tags a small batch of still-untagged products per call, instead of the
// whole catalog in one request — a full "Tag all with AI" pass can take
// several minutes across hundreds of products, well past Vercel's function
// timeout. The "Tag all with AI" button in ProductList.jsx calls this
// repeatedly until `remaining` hits 0.
export const maxDuration = 60;

const BATCH_SIZE = 5;

export async function POST() {
  try {
    const { rows: categories } = await query(
      'SELECT key, label, sub_label, is_multi, max_tags, values FROM tag_categories ORDER BY key'
    );

    const ids = await findUntaggedProductIds(query, { limit: BATCH_SIZE });

    const tagged = [];
    const failed = [];

    for (const id of ids) {
      const { rows: productRows } = await query(
        'SELECT id, title, description, image_url FROM products WHERE id = $1',
        [id]
      );
      const product = productRows[0];
      try {
        await applyAiTags(query, product, categories);
        tagged.push({ id, title: product.title });
      } catch (err) {
        console.error(`AI tag failed for ${id}:`, err);
        failed.push({ id, title: product.title, error: err.message });
      }
    }

    const remaining = await countUntaggedProducts(query);

    return NextResponse.json({ tagged, failed, remaining });
  } catch (err) {
    console.error('AI tag batch failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
