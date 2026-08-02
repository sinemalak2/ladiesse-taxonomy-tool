import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

describe('buildOAuthState / verifyOAuthState', () => {
  before(() => {
    process.env.AUTH_SECRET = 'test-secret-for-oauth-state';
  });

  test('round-trips a brandId', async () => {
    const { buildOAuthState, verifyOAuthState } = await import('../lib/brandShopifyAuth.js');
    const state = buildOAuthState('brand-123');
    assert.equal(verifyOAuthState(state), 'brand-123');
  });

  test('rejects a tampered state', async () => {
    const { buildOAuthState, verifyOAuthState } = await import('../lib/brandShopifyAuth.js');
    const state = buildOAuthState('brand-123');
    const tampered = state.slice(0, -1) + (state.slice(-1) === '0' ? '1' : '0');
    assert.equal(verifyOAuthState(tampered), null);
  });

  test('rejects malformed input', async () => {
    const { verifyOAuthState } = await import('../lib/brandShopifyAuth.js');
    assert.equal(verifyOAuthState('not-a-valid-state'), null);
    assert.equal(verifyOAuthState(''), null);
    assert.equal(verifyOAuthState(null), null);
  });
});

describe('verifyShopifyCallbackHmac', () => {
  test('accepts a correctly signed query string', async () => {
    const { verifyShopifyCallbackHmac } = await import('../lib/brandShopifyAuth.js');
    const secret = 'shopify-client-secret';
    const message = 'code=abc123&shop=test.myshopify.com&state=xyz&timestamp=1700000000';
    const hmac = createHmac('sha256', secret).update(message).digest('hex');

    const params = new URLSearchParams(
      'code=abc123&shop=test.myshopify.com&state=xyz&timestamp=1700000000'
    );
    params.set('hmac', hmac);
    assert.equal(verifyShopifyCallbackHmac(params, secret), true);
  });

  test('rejects a tampered query string', async () => {
    const { verifyShopifyCallbackHmac } = await import('../lib/brandShopifyAuth.js');
    const secret = 'shopify-client-secret';
    const message = 'code=abc123&shop=test.myshopify.com&state=xyz&timestamp=1700000000';
    const hmac = createHmac('sha256', secret).update(message).digest('hex');

    const params = new URLSearchParams(
      'code=tampered&shop=test.myshopify.com&state=xyz&timestamp=1700000000'
    );
    params.set('hmac', hmac);
    assert.equal(verifyShopifyCallbackHmac(params, secret), false);
  });

  test('rejects when hmac param is missing', async () => {
    const { verifyShopifyCallbackHmac } = await import('../lib/brandShopifyAuth.js');
    const params = new URLSearchParams('code=abc123&shop=test.myshopify.com');
    assert.equal(verifyShopifyCallbackHmac(params, 'secret'), false);
  });
});
