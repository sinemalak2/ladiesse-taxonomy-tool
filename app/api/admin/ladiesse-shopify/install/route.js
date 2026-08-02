import { NextResponse } from 'next/server';
import { buildShopifyInstallUrl, buildOAuthState } from '../../../../../lib/brandShopifyAuth.js';

// Staff-only (protected by the existing session middleware — this path
// isn't under /api/onboard/, so it falls under the general staff-session
// gate). One-time setup action: connects App B (the per-brand OAuth app)
// to la-diesse.myshopify.com itself, the exact same way a brand connects —
// see app/api/admin/ladiesse-shopify/callback/route.js for the other half.
const SELF_CONNECT_MARKER = 'ladiesse-self-connect';

export async function GET(request) {
  const clientId = process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'App B is not configured yet' }, { status: 501 });
  }

  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  if (!shop) {
    return NextResponse.json({ error: 'SHOPIFY_STORE_DOMAIN is not set' }, { status: 500 });
  }

  const redirectUri = new URL('/api/admin/ladiesse-shopify/callback', request.url).toString();
  const state = buildOAuthState(SELF_CONNECT_MARKER);
  const installUrl = buildShopifyInstallUrl({ shop, clientId, redirectUri, state });

  return NextResponse.redirect(installUrl);
}
