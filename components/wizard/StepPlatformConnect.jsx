'use client';

import { useState } from 'react';
import { step8Schema } from '../../lib/brandValidation.js';

export default function StepPlatformConnect({ payload }) {
  const [shopDomain, setShopDomain] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');

  const connection = payload.connection;

  if (connection?.status === 'active') {
    return (
      <div className="wizard-holding">
        <p style={{ fontWeight: 400, color: 'var(--color-black)', marginBottom: 8 }}>
          Connected to {connection.shop_domain}
        </p>
        <p>Your Shopify store is connected. We're pulling in your catalogue next.</p>
      </div>
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setFieldError('');

    const parsed = step8Schema.safeParse({ platform: 'shopify', shop_domain: shopDomain });
    if (!parsed.success) {
      setFieldError(parsed.error.flatten().fieldErrors.shop_domain?.[0] || 'Invalid shop domain');
      return;
    }

    // Full browser navigation (not fetch) — Shopify needs to redirect the
    // actual tab through its own authorize screen and back.
    window.location.href = `/api/onboard/shopify/install?shop=${encodeURIComponent(parsed.data.shop_domain)}`;
  }

  return (
    <div>
      <p style={{ marginBottom: 16, color: 'var(--color-mid)', fontSize: 13 }}>
        Your contract is signed. Connect your Shopify store so we can sync your product catalogue.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="shop_domain">Your Shopify store domain</label>
          <input
            id="shop_domain"
            placeholder="yourstore.myshopify.com"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            autoFocus
          />
          {fieldError && <span className="field-error">{fieldError}</span>}
        </div>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="btn btn-gold">
          Connect Shopify
        </button>
      </form>
    </div>
  );
}
