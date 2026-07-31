import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';

// Staff-only (protected by the existing session middleware, same as every
// other /api/brands/* route) — issues a fresh onboarding link when the old
// one leaks or a staffer needs to re-share it.
export async function POST(request, { params }) {
  const { id } = await params;
  const newToken = randomBytes(32).toString('hex');

  const { rows } = await query(
    'UPDATE brands SET onboarding_token = $1, updated_at = now() WHERE id = $2 RETURNING id, onboarding_token',
    [newToken, id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  return NextResponse.json({
    onboarding_token: rows[0].onboarding_token,
    onboard_url: `/onboard/${rows[0].onboarding_token}`,
  });
}
