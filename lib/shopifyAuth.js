// Custom apps created in Shopify's Dev Dashboard no longer expose a static
// Admin API token in the UI. Instead the app has a Client ID + Client Secret,
// exchanged for a short-lived (24h) access token via the OAuth 2.0 client
// credentials grant: https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens

let cachedToken = null;
let cachedExpiresAt = 0;

const REFRESH_MARGIN_MS = 60_000;

export function isTokenExpired(expiresAt, now = Date.now()) {
  return now >= expiresAt - REFRESH_MARGIN_MS;
}

async function requestAccessToken({ storeDomain, clientId, clientSecret }) {
  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify token request failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function getShopifyAccessToken() {
  if (cachedToken && !isTokenExpired(cachedExpiresAt)) {
    return cachedToken;
  }

  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!storeDomain || !clientId || !clientSecret) {
    throw new Error('SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set');
  }

  const { access_token: accessToken, expires_in: expiresIn } = await requestAccessToken({
    storeDomain,
    clientId,
    clientSecret,
  });

  cachedToken = accessToken;
  cachedExpiresAt = Date.now() + expiresIn * 1000;
  return cachedToken;
}
