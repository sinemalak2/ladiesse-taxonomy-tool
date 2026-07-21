import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';
import { validateTagValues } from '../../../../../lib/tagValidation.js';

export async function POST(request, { params }) {
  const { id } = await params;
  const { category_key: categoryKey, values, tagged_by: taggedBy } = await request.json();

  if (!categoryKey) {
    return NextResponse.json({ error: 'category_key is required' }, { status: 400 });
  }

  const { rows: categoryRows } = await query(
    'SELECT key, label, max_tags, values FROM tag_categories WHERE key = $1',
    [categoryKey]
  );
  if (categoryRows.length === 0) {
    return NextResponse.json({ error: `Unknown category "${categoryKey}"` }, { status: 404 });
  }

  const validationError = validateTagValues(values, categoryRows[0]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const { rows } = await query(
      `INSERT INTO product_tags (product_id, category_key, values, tagged_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (product_id, category_key) DO UPDATE SET
         values = EXCLUDED.values,
         tagged_by = EXCLUDED.tagged_by,
         updated_at = now()
       RETURNING category_key, values, tagged_by, updated_at`,
      [id, categoryKey, values, taggedBy ?? null]
    );
    return NextResponse.json({ tag: rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    throw err;
  }
}
