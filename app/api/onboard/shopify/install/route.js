import { NextResponse } from 'next/server';
import { BRAND_SESSION_COOKIE_NAME, verifyBrandSessionToken } from '../../../../../lib/brandAuth.js';
import { buildShopifyInstallUrl, buildOAuthState } from '../../../../../lib/brandShopifyAuth.js';

// Brand clicks "Connect Shopify" (wizard step 8) → this route redirects them
// to Shopify's authorize screen. Protected by the existing brand-session
// middleware check on /api/onboard/*, so `brandId` below is trustworthy.
export async function GET(request) {
  const token = request.cookies.get(BRAND_SESSION_COOKIE_NAME)?.value;
  const session = await verifyBrandSessionToken(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const shop = (new URL(request.url).searchParams.get('shop') || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) {
    return NextResponse.json({ error: 'Must be a valid .myshopify.com domain' }, { status: 400 });
  }

  const clientId = process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Shopify app is not configured yet' }, { status: 501 });
  }

  const redirectUri = new URL('/api/onboard/shopify/callback', request.url).toString();
  const state = buildOAuthState(session.brandId);
  const installUrl = buildShopifyInstallUrl({ shop, clientId, redirectUri, state });

  return NextResponse.redirect(installUrl);
}
