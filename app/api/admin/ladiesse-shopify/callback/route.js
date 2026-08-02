import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';
import { verifyShopifyCallbackHmac, verifyOAuthState, exchangeCodeForToken } from '../../../../../lib/brandShopifyAuth.js';
import { encryptToken } from '../../../../../lib/brandTokenEncryption.js';

// Shopify redirects here after staff approves App B's install on
// la-diesse.myshopify.com itself (triggered from
// app/api/admin/ladiesse-shopify/install/route.js). No staff session is
// relied on for this hop — same reasoning as the per-brand callback: the
// signed `state` param is what's actually trusted, not a cookie. Excluded
// from the staff-session middleware check entirely (see middleware.js).
const SELF_CONNECT_MARKER = 'ladiesse-self-connect';

export async function GET(request) {
  const url = new URL(request.url);
  const clientId = process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'App B is not configured yet' }, { status: 501 });
  }

  if (!verifyShopifyCallbackHmac(url.searchParams, clientSecret)) {
    return NextResponse.json({ error: 'Invalid callback signature' }, { status: 400 });
  }

  const marker = verifyOAuthState(url.searchParams.get('state'));
  if (marker !== SELF_CONNECT_MARKER) {
    return NextResponse.json(
      { error: 'This connection attempt expired. Please retry from the admin page.' },
      { status: 400 }
    );
  }

  const shop = url.searchParams.get('shop');
  const code = url.searchParams.get('code');
  if (!shop || !code) {
    return NextResponse.json({ error: 'Missing shop or code from Shopify' }, { status: 400 });
  }

  const { accessToken, scope } = await exchangeCodeForToken({ shop, code, clientId, clientSecret });
  const encryptedToken = encryptToken(accessToken);

  // No webhooks registered here — unlike the per-brand connection, this
  // one is push-only (lib/brandProductImport.js writes TO la-diesse), so
  // there's nothing on la-diesse's own store we need to pull or stay
  // notified about via this connection.
  await query(
    `INSERT INTO ladiesse_shopify_connection (shop_domain, access_token_ref, scope)
     VALUES ($1, $2, $3)`,
    [shop, encryptedToken, scope]
  );

  return NextResponse.redirect(new URL('/brands', request.url));
}
