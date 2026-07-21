import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';

export async function POST(request, { params }) {
  const { key } = await params;
  const { value } = await request.json();

  if (!value || !value.trim()) {
    return NextResponse.json({ error: 'value is required' }, { status: 400 });
  }

  const { rows } = await query(
    `UPDATE tag_categories
     SET values = array_append(values, $2)
     WHERE key = $1 AND NOT ($2 = ANY(values))
     RETURNING key, label, sub_label, is_multi, max_tags, values`,
    [key, value.trim()]
  );

  if (rows.length === 0) {
    const { rows: existing } = await query('SELECT key FROM tag_categories WHERE key = $1', [key]);
    if (existing.length === 0) {
      return NextResponse.json({ error: `Unknown category "${key}"` }, { status: 404 });
    }
    // Value already present — return the category unchanged rather than erroring.
    const { rows: current } = await query(
      'SELECT key, label, sub_label, is_multi, max_tags, values FROM tag_categories WHERE key = $1',
      [key]
    );
    return NextResponse.json({ category: current[0] });
  }

  return NextResponse.json({ category: rows[0] });
}
