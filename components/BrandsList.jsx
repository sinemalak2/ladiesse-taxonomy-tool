'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const ONBOARDING_STATUSES = [
  'pending',
  'under_review',
  'terms_set',
  'integration_pending',
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

  useEffect(() => {
    fetch('/api/brands')
      .then((res) => res.json())
      .then((json) => setBrands(json.brands));
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

      {brands === null ? (
        <div className="status-text">Loading…</div>
      ) : brands.length === 0 ? (
        <div className="empty-state">No brands yet.</div>
      ) : (
        <div className="brand-list">
          {brands.map((b) => (
            <div className="brand-row" key={b.id}>
              <div className="meta">
                <div className="name">{b.brand_name}</div>
                <div className="sub">
                  {b.contact_name || 'No contact'}
                  {b.contact_email ? ` · ${b.contact_email}` : ''}
                  {b.contact_phone ? ` · ${b.contact_phone}` : ''}
                </div>
              </div>
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
