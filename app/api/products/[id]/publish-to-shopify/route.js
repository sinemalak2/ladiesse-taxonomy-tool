import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';
import { shopifyGraphql, METAFIELDS_SET_MUTATION } from '../../../../../lib/shopify.js';
import { buildTaxonomyMetafields } from '../../../../../lib/metafields.js';

export async function POST(request, { params }) {
  const { id } = await params;

  const { rows: productRows } = await query('SELECT id FROM products WHERE id = $1', [id]);
  if (productRows.length === 0) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const { rows: tagRows } = await query(
    'SELECT category_key, values FROM product_tags WHERE product_id = $1',
    [id]
  );

  const metafields = buildTaxonomyMetafields(id, tagRows);
  if (metafields.length === 0) {
    return NextResponse.json({ error: 'No tags to publish for this product' }, { status: 400 });
  }

  const data = await shopifyGraphql(METAFIELDS_SET_MUTATION, { metafields });
  const userErrors = data.metafieldsSet.userErrors;

  if (userErrors.length > 0) {
    return NextResponse.json({ error: userErrors.map((e) => e.message).join('; ') }, { status: 502 });
  }

  return NextResponse.json({ ok: true, metafields: data.metafieldsSet.metafields });
}
