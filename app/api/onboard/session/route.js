import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db.js';
import { BRAND_SESSION_COOKIE_NAME, createBrandSessionToken } from '../../../../lib/brandAuth.js';

// The brand's "login" — exchanges their onboarding_token (from the magic
// link URL) for a brand-scoped session cookie. Excluded from middleware's
// brand-session check (it's the route that establishes that session).
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || '').trim();

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 });
  }

  const { rows } = await query(
    'SELECT id, current_step, onboarding_status FROM brands WHERE onboarding_token = $1',
    [token]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 });
  }

  const brand = rows[0];
  const sessionToken = await createBrandSessionToken(brand.id);

  const response = NextResponse.json({
    brandId: brand.id,
    currentStep: brand.current_step,
    onboardingStatus: brand.onboarding_status,
  });

  response.cookies.set(BRAND_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}
