import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';

export async function POST(request, { params }) {
  const { id } = await params;
  const { notes } = await request.json();

  try {
    const { rows } = await query(
      `INSERT INTO product_notes (product_id, notes, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (product_id) DO UPDATE SET
         notes = EXCLUDED.notes,
         updated_at = now()
       RETURNING notes, updated_at`,
      [id, notes ?? '']
    );
    return NextResponse.json({ notes: rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    throw err;
  }
}
