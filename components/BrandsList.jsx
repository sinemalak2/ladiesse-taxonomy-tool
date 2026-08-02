'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const ONBOARDING_STATUSES = [
  'pending',
  'under_review',
  'terms_set',
  'contract_generated',
  'contract_signed',
  'platform_connected',
  'syncing_products',
  'active',
  'paused',
  'suspended',
  'offboarded',
];

function statusLabel(status) {
  return status.replace(/_/g, ' ');
}

export default function BrandsList({ showTaxonomyNav }) {
  const [brands, setBrands] = useState(null);
  const [ladiesseConnection, setLadiesseConnection] = useState(null);
  const [ladiesseConnectionLoaded, setLadiesseConnectionLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/brands')
      .then((res) => res.json())
      .then((json) => setBrands(json.brands));
    fetch('/api/admin/ladiesse-shopify/status')
      .then((res) => res.json())
      .then((json) => {
        setLadiesseConnection(json.connection);
        setLadiesseConnectionLoaded(true);
      });
  }, []);

  function handleStatusChange(brandId, newStatus) {
    setBrands((prev) => prev.map((b) => (b.id === brandId ? { ...b, onboarding_status: newStatus } : b)));

    fetch(`/api/brands/${brandId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_status: newStatus }),
    }).catch(() => {});
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          {showTaxonomyNav && (
            <Link href="/" className="breadcrumb-back">
              ‹ Taxonomy
            </Link>
          )}
          <h1>Brands</h1>
          <div className="tagline">Onboarding</div>
        </div>
        <Link href="/brands/new" className="btn btn-gold">
          Add Brand
        </Link>
      </div>

      {ladiesseConnectionLoaded && (
        <div className="form-card" style={{ marginBottom: 24 }}>
          <div className="section-heading">La-diesse's own Shopify connection</div>
          <div className="field-row" style={{ alignItems: 'center', gap: 12 }}>
            <div className="status-text">
              {ladiesseConnection
                ? `Connected to ${ladiesseConnection.shop_domain} · ${ladiesseConnection.status}`
                : 'Not connected yet — needed before any brand catalogue can be pushed into la-diesse.myshopify.com'}
            </div>
            {(!ladiesseConnection || ladiesseConnection.status !== 'active') && (
              <a href="/api/admin/ladiesse-shopify/install" className="btn btn-gold">
                Connect
              </a>
            )}
          </div>
        </div>
      )}

      {brands === null ? (
        <div className="status-text">Loading…</div>
      ) : brands.length === 0 ? (
        <div className="empty-state">No brands yet.</div>
      ) : (
        <div className="brand-list">
          {brands.map((b) => (
            <div className="brand-row" key={b.id}>
              <Link href={`/brands/${b.id}`} className="meta">
                <div className="name">{b.brand_name}</div>
                <div className="sub">
                  {b.contact_name || 'No contact'}
                  {b.contact_email ? ` · ${b.contact_email}` : ''}
                  {b.contact_phone ? ` · ${b.contact_phone}` : ''}
                </div>
              </Link>
              <select
                className={`status-badge status-${b.onboarding_status}`}
                value={b.onboarding_status}
                onChange={(e) => handleStatusChange(b.id, e.target.value)}
              >
                {ONBOARDING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
