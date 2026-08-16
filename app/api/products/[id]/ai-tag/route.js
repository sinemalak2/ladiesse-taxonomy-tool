import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';
import { generateProductTags } from '../../../../../lib/aiTagger.js';

// The Claude vision call (plus fetching the product image) routinely takes
// longer than Vercel's 10s default function timeout, which cuts the
// response off mid-stream — the client then fails trying to parse the
// truncated body as JSON. 60s is the max Vercel allows on Hobby.
export const maxDuration = 60;

// Regenerates every category's tags for one product via AI. This is a
// deliberate single-product action (the tagger UI's "Tag with AI" button),
// so unlike the bulk script it always overwrites, including rows already
// reviewed by hand — the reviewer clicked it on purpose.
export async function POST(request, { params }) {
  const { id } = await params;

  try {
    const { rows: productRows } = await query(
      'SELECT id, title, description, image_url FROM products WHERE id = $1',
      [id]
    );
    if (productRows.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { rows: categories } = await query(
      'SELECT key, label, sub_label, is_multi, max_tags, values FROM tag_categories ORDER BY key'
    );

    let tagsByCategory;
    try {
      tagsByCategory = await generateProductTags(productRows[0], categories);
    } catch (err) {
      console.error('AI tag generation failed:', err);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

    const results = [];
    for (const category of categories) {
      const values = tagsByCategory[category.key] ?? [];
      const { rows: upserted } = await query(
        `INSERT INTO product_tags (product_id, category_key, values, tagged_by, updated_at)
         VALUES ($1, $2, $3, 'AI', now())
         ON CONFLICT (product_id, category_key) DO UPDATE SET
           values = EXCLUDED.values,
           tagged_by = EXCLUDED.tagged_by,
           updated_at = now()
         RETURNING category_key, values, tagged_by, updated_at`,
        [id, category.key, values]
      );
      results.push(upserted[0]);
    }

    return NextResponse.json({ tags: results });
  } catch (err) {
    console.error('AI tag route failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
