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

  // ladiesse-market-place-orders calls this server-to-server at query time — no
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
    // brands.ladiesse.com is a second domain on this same deployment,
    // dedicated to the brand onboarding pages — its root should land on
    // the brands list rather than the product tagging tool.
    const hostname = request.headers.get('host') || '';
    if (hostname.startsWith('brands.ladiesse.com') && pathname === '/') {
      return NextResponse.rewrite(new URL('/brands', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}
