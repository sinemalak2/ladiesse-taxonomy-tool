import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from './lib/auth.js';
import { BRAND_SESSION_COOKIE_NAME, verifyBrandSessionToken } from './lib/brandAuth.js';

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

  // Brand onboarding wizard — its own session (ladiesse_brand_session),
  // entirely separate from the staff cookie below. A brand's link never
  // grants staff access and vice versa.
  if (pathname === '/api/onboard/session') {
    return NextResponse.next(); // this route establishes the session itself
  }

  // Shopify redirects the brand's browser here after OAuth approval — no
  // session cookie is relied on for this hop (brandId travels in the
  // signed `state` param instead; see lib/brandShopifyAuth.js). The route
  // itself verifies Shopify's callback HMAC before trusting anything.
  if (pathname === '/api/onboard/shopify/callback') {
    return NextResponse.next();
  }

  // Shopify calls these server-to-server with its own HMAC signature on the
  // raw body, not a browser session — the route itself verifies that.
  if (pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next();
  }

  // Shopify redirects here after staff approves App B's install on
  // la-diesse.myshopify.com itself — no session cookie for this hop either
  // (same reasoning as the brand callback above), verified via signed state.
  if (pathname === '/api/admin/ladiesse-shopify/callback') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/onboard/')) {
    const segments = pathname.split('/').filter(Boolean); // ['onboard', token, ...]
    if (segments.length === 2) {
      // /onboard/<token> is the brand's "login" page — always public.
      return NextResponse.next();
    }
    const brandToken = request.cookies.get(BRAND_SESSION_COOKIE_NAME)?.value;
    const brandSession = await verifyBrandSessionToken(brandToken);
    if (brandSession) return NextResponse.next();
    // No/expired session this deep in the flow — bounce back to the landing
    // page so it can re-establish one from the token already in the URL.
    return NextResponse.redirect(new URL(`/onboard/${segments[1]}`, request.url));
  }

  if (pathname.startsWith('/api/onboard/')) {
    const brandToken = request.cookies.get(BRAND_SESSION_COOKIE_NAME)?.value;
    const brandSession = await verifyBrandSessionToken(brandToken);
    if (brandSession) return NextResponse.next();
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
