import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';
import { verifyShopifyCallbackHmac, verifyOAuthState, exchangeCodeForToken } from '../../../../../lib/brandShopifyAuth.js';
import { encryptToken } from '../../../../../lib/brandTokenEncryption.js';
import { brandShopifyGraphql, SHOP_CURRENCY_QUERY } from '../../../../../lib/brandShopify.js';

// Shopify redirects the brand's browser here after they approve the
// install. No brand session cookie is relied on — brandId travels in the
// signed `state` param instead (see lib/brandShopifyAuth.js), so this
// route is excluded from the brand-session middleware check entirely.
export async function GET(request) {
  const url = new URL(request.url);
  if (!process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_ID || !process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Shopify app is not configured yet' }, { status: 501 });
  }

  if (!verifyShopifyCallbackHmac(url.searchParams, process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_SECRET)) {
    return NextResponse.json({ error: 'Invalid callback signature' }, { status: 400 });
  }

  const brandId = verifyOAuthState(url.searchParams.get('state'));
  if (!brandId) {
    return NextResponse.json(
      { error: 'This connection attempt expired. Please go back and try again.' },
      { status: 400 }
    );
  }

  const shop = url.searchParams.get('shop');
  const code = url.searchParams.get('code');
  if (!shop || !code) {
    return NextResponse.json({ error: 'Missing shop or code from Shopify' }, { status: 400 });
  }

  const { rows: brandRows } = await query('SELECT onboarding_token FROM brands WHERE id = $1', [brandId]);
  if (brandRows.length === 0) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }
  const { onboarding_token: onboardingToken } = brandRows[0];

  let accessToken, scope;
  try {
    ({ accessToken, scope } = await exchangeCodeForToken({
      shop,
      code,
      clientId: process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_ID,
      clientSecret: process.env.SHOPIFY_BRAND_ONBOARDING_CLIENT_SECRET,
    }));
  } catch (err) {
    // Redirect back into the wizard with an error rather than a bare JSON
    // 500 — the brand is mid-flow in a browser tab, not calling an API.
    const errorUrl = new URL(`/onboard/${onboardingToken}/step/8`, request.url);
    errorUrl.searchParams.set('error', 'shopify_connect_failed');
    return NextResponse.redirect(errorUrl);
  }

  const encryptedToken = encryptToken(accessToken);

  // Needed to convert this brand's prices into la-diesse.myshopify.com's
  // own currency when importing their catalogue — the brand's legal
  // country (used elsewhere for tax ID/bank format) isn't a reliable proxy
  // for what currency their actual Shopify store sells in.
  let shopCurrency = null;
  try {
    const shopData = await brandShopifyGraphql({ shopDomain: shop, accessToken, query: SHOP_CURRENCY_QUERY });
    shopCurrency = shopData.shop.currencyCode;
  } catch (err) {
    console.error('Failed to fetch brand shop currency:', err);
    // Non-fatal — the connection still succeeds; import will just need this
    // backfilled (or will fail loudly with a clear cause) rather than the
    // whole OAuth flow failing over a currency lookup.
  }

  const { rows: connectionRows } = await query(
    `INSERT INTO brand_platform_connections (brand_id, platform, shop_domain, access_token_ref, scope, currency)
     VALUES ($1, 'shopify', $2, $3, $4, $5)
     ON CONFLICT (brand_id, platform) DO UPDATE SET
       shop_domain = EXCLUDED.shop_domain,
       access_token_ref = EXCLUDED.access_token_ref,
       scope = EXCLUDED.scope,
       currency = EXCLUDED.currency,
       status = 'active',
       connected_at = now(),
       revoked_at = NULL
     RETURNING id`,
    [brandId, shop, encryptedToken, scope, shopCurrency]
  );
  const connectionId = connectionRows[0].id;

  await query(
    `UPDATE brands SET onboarding_status = 'platform_connected', current_step = GREATEST(current_step, 9), updated_at = now()
     WHERE id = $1`,
    [brandId]
  );

  // A pending job so Step 9 has something to show immediately. The actual
  // sync is deliberately NOT run here — a full catalogue sync can take
  // longer than a browser tab should sit on a redirect (and longer than a
  // serverless function should block a response). Step 9's own GET handler
  // (app/api/onboard/me/step/[step]/route.js) triggers it the first time it
  // sees this job still 'pending', then the wizard polls for completion.
  await query(
    `INSERT INTO product_sync_jobs (brand_id, platform_connection_id, status, triggered_by)
     VALUES ($1, $2, 'pending', 'wizard')`,
    [brandId, connectionId]
  );

  await registerWebhooks({ shop, accessToken }).catch((err) => {
    // Non-fatal — the initial sync still works without webhooks; staff can
    // re-register later. Don't fail the whole OAuth flow over this.
    console.error('Shopify webhook registration failed:', err);
  });

  return NextResponse.redirect(new URL(`/onboard/${onboardingToken}/step/9`, request.url));
}

async function registerWebhooks({ shop, accessToken }) {
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';
  const address = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/shopify`;
  const topics = ['products/create', 'products/update', 'products/delete', 'inventory_levels/update'];

  for (const topic of topics) {
    await fetch(`https://${shop}/admin/api/${apiVersion}/webhooks.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
    });
  }
}
