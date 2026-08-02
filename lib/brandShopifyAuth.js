// Per-brand Shopify OAuth (authorization-code grant) — distinct from
// lib/shopifyAuth.js, which is the client-credentials grant for Ladiesse's
// own single store. This module is what powers wizard Step 8: a brand
// enters their shop domain, gets redirected to Shopify to authorize, and
// Shopify redirects back with a code we exchange for a token.
//
// Runs only in Node.js route handlers (never Edge middleware), so it uses
// Node's `crypto` module directly rather than Web Crypto.

import { createHmac, timingSafeEqual } from 'node:crypto';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — just long enough to click through Shopify's authorize screen

// This app only ever reads from a brand's store (lib/brandSync.js pulls
// their catalogue into our own DB, then lib/brandProductImport.js pushes it
// into la-diesse.myshopify.com using App A's own client-credentials grant,
// not this token) — no write scopes or read_locations needed here.
const REQUIRED_SCOPES = ['read_products', 'read_inventory'];

export function buildShopifyInstallUrl({ shop, clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: REQUIRED_SCOPES.join(','),
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken({ shop, code, clientId, clientSecret }) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  if (!res.ok) {
    throw new Error(`Shopify token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Shopify token exchange response missing access_token');
  }
  return { accessToken: data.access_token, scope: data.scope };
}

// CSRF protection for the OAuth redirect round-trip. The callback URL has
// no brand session (Shopify, not the brand's browser session in a
// meaningful sense, drives that redirect) — encoding brandId in a signed
// state param is how the callback knows which brand this is for, the same
// way lib/auth.js's session token encodes an identity in a signed payload.
export function buildOAuthState(brandId) {
  const secret = requireSecret();
  const expires = Date.now() + STATE_TTL_MS;
  const payload = `${brandId}|${expires}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

export function verifyOAuthState(state) {
  if (!state || !state.includes('.')) return null;
  const [payloadB64, signature] = state.split('.');

  try {
    const secret = requireSecret();
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

    const [brandId, expiresStr] = payload.split('|');
    if (Date.now() > Number(expiresStr)) return null;
    return brandId;
  } catch {
    return null;
  }
}

// Verifies Shopify's own signature on the OAuth callback query string
// (distinct from the webhook HMAC in app/api/webhooks/shopify/route.js,
// which signs a raw POST body instead of query params). Per Shopify's
// spec: remove `hmac`, sort the rest alphabetically, join as key=value
// pairs with `&`, HMAC-SHA256 with the app's client secret, compare hex.
export function verifyShopifyCallbackHmac(searchParams, clientSecret) {
  const hmac = searchParams.get('hmac');
  if (!hmac) return false;

  const pairs = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === 'hmac') continue;
    pairs.push([key, value]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = pairs.map(([k, v]) => `${k}=${v}`).join('&');

  const expected = createHmac('sha256', clientSecret).update(message).digest('hex');
  const hmacBuf = Buffer.from(hmac, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  return hmacBuf.length === expectedBuf.length && timingSafeEqual(hmacBuf, expectedBuf);
}

function requireSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return secret;
}
