import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from './lib/auth.js';

export const config = {
  matcher: ['/((?!api/login|login|_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;

  // Vercel Cron hits these on a schedule with its own bearer secret, not a
  // browser session — let each route's own check handle it (see
  // api/sync/route.js and api/affinity-pipeline/route.js).
  if (pathname === '/api/sync' || pathname === '/api/affinity-pipeline') {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.next();
    }
  }

  // ladiesse-ai-search calls this server-to-server at query time — no
  // browser session, own bearer secret (see api/users/[user_key]/affinity/route.js).
  if (pathname.startsWith('/api/users/') && pathname.endsWith('/affinity')) {
    const authHeader = request.headers.get('authorization');
    if (process.env.AFFINITY_API_SECRET && authHeader === `Bearer ${process.env.AFFINITY_API_SECRET}`) {
      return NextResponse.next();
    }
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}
