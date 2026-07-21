import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db.js';

export async function GET(request, { params }) {
  const { id } = await params;

  const { rows: productRows } = await query(
    'SELECT id, title, handle, image_url, price, status, synced_at, marked_for_removal FROM products WHERE id = $1',
    [id]
  );

  if (productRows.length === 0) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const { rows: tagRows } = await query(
    'SELECT category_key, values, tagged_by, updated_at FROM product_tags WHERE product_id = $1',
    [id]
  );

  const { rows: noteRows } = await query(
    'SELECT notes, updated_at FROM product_notes WHERE product_id = $1',
    [id]
  );

  return NextResponse.json({
    product: productRows[0],
    tags: tagRows,
    notes: noteRows[0] ?? { notes: '', updated_at: null },
  });
}
