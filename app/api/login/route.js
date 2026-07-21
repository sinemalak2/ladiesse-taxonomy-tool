import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, createSessionToken, isAllowedEmail } from '../../../lib/auth.js';

export async function POST(request) {
  const { email, password } = await request.json().catch(() => ({}));

  if (!isAllowedEmail(email) || password !== process.env.SITE_PASSWORD) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = await createSessionToken(email.toLowerCase().trim());
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
