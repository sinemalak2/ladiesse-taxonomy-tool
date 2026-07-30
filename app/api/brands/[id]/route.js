import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db.js';

const ONBOARDING_STATUSES = [
  'pending',
  'under_review',
  'terms_set',
  'integration_pending',
  'active',
  'paused',
  'suspended',
  'offboarded',
];

export async function PATCH(request, { params }) {
  const { id } = await params;
  const { onboarding_status: status } = await request.json();

  if (!ONBOARDING_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid onboarding_status' }, { status: 400 });
  }

  // live_at is set the first time a brand reaches 'active' and never
  // cleared afterward, so it stays a record of when the catalogue first
  // went live even if the brand later pauses/offboards.
  const { rows } = await query(
    `UPDATE brands
     SET onboarding_status = $1,
         live_at = CASE WHEN $1 = 'active' AND live_at IS NULL THEN now() ELSE live_at END,
         updated_at = now()
     WHERE id = $2
     RETURNING id, brand_name, onboarding_status`,
    [status, id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  return NextResponse.json({ brand: rows[0] });
}
