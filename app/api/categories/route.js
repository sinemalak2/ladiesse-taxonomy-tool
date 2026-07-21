import { NextResponse } from 'next/server';
import { query } from '../../../lib/db.js';

export async function GET() {
  const { rows } = await query(
    'SELECT key, label, sub_label, is_multi, max_tags, values FROM tag_categories ORDER BY key'
  );
  return NextResponse.json({ categories: rows });
}
