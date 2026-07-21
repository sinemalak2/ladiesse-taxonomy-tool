import { NextResponse } from 'next/server';
import { query } from '../../../lib/db.js';
import { parsePage } from '../../../lib/pagination.js';

const PAGE_SIZE = 24;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim();
  const page = parsePage(searchParams.get('page'));
  const offset = (page - 1) * PAGE_SIZE;

  const searchPattern = search ? `%${search}%` : null;

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM products
     WHERE $1::text IS NULL OR title ILIKE $1`,
    [searchPattern]
  );
  const total = countRows[0].total;

  // Catalog-wide count, independent of the current search/page — the bulk
  // delete button needs to reflect everything marked, not just this page.
  const { rows: markedRows } = await query(
    'SELECT COUNT(*)::int AS count FROM products WHERE marked_for_removal = true'
  );
  const markedCount = markedRows[0].count;

  const { rows } = await query(
    `SELECT
       p.id, p.title, p.handle, p.image_url, p.price, p.status, p.synced_at, p.marked_for_removal,
       COUNT(pt.category_key) FILTER (WHERE array_length(pt.values, 1) > 0)::int AS tagged_count,
       (SELECT COUNT(*)::int FROM tag_categories) AS total_categories
     FROM products p
     LEFT JOIN product_tags pt ON pt.product_id = p.id
     WHERE $1::text IS NULL OR p.title ILIKE $1
     GROUP BY p.id
     ORDER BY p.title ASC
     LIMIT $2 OFFSET $3`,
    [searchPattern, PAGE_SIZE, offset]
  );

  return NextResponse.json({
    products: rows,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    markedCount,
  });
}
