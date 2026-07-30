import { NextResponse } from 'next/server';
import { getPool, query } from '../../../lib/db.js';

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics, e.g. Ünvanı -> Unvani
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET() {
  const { rows } = await query(`
    SELECT
      b.id, b.brand_name, b.slug, b.category, b.website_url, b.instagram_handle,
      b.onboarding_status, b.created_at,
      c.full_name AS contact_name, c.email AS contact_email, c.phone_number AS contact_phone
    FROM brands b
    LEFT JOIN LATERAL (
      SELECT full_name, email, phone_number
      FROM brand_contacts
      WHERE brand_id = b.id
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    ) c ON true
    ORDER BY b.created_at DESC
  `);
  return NextResponse.json({ brands: rows });
}

export async function POST(request) {
  const body = await request.json();
  const brandName = (body.brandName || '').trim();
  const contactName = (body.contactName || '').trim();
  const contactPhone = (body.contactPhone || '').trim();
  const contactEmail = (body.contactEmail || '').trim();
  const category = (body.category || '').trim() || null;
  const websiteUrl = (body.websiteUrl || '').trim() || null;
  const instagramHandle = (body.instagramHandle || '').trim() || null;

  if (!brandName || !contactName || !contactPhone) {
    return NextResponse.json(
      { error: 'Brand name, contact name, and contact phone are required' },
      { status: 400 }
    );
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // Slugs must be unique; retry with a numeric suffix on collision
    // (two brands submitting the same name is a real scenario here).
    const base = slugify(brandName) || 'brand';
    let slug = base;
    let suffix = 1;
    while ((await client.query('SELECT 1 FROM brands WHERE slug = $1', [slug])).rows.length > 0) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }

    const { rows: brandRows } = await client.query(
      `INSERT INTO brands (brand_name, slug, category, website_url, instagram_handle)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, brand_name, slug, category, onboarding_status, created_at`,
      [brandName, slug, category, websiteUrl, instagramHandle]
    );
    const brand = brandRows[0];

    await client.query(
      `INSERT INTO brand_contacts (brand_id, full_name, phone_number, email, role, is_primary)
       VALUES ($1, $2, $3, $4, 'primary', true)`,
      [brand.id, contactName, contactPhone, contactEmail || null]
    );

    await client.query('COMMIT');
    return NextResponse.json({ brand }, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
