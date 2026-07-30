'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function statusLabel(status) {
  return status.replace(/_/g, ' ');
}

export default function BrandsPage() {
  const [brands, setBrands] = useState(null);

  useEffect(() => {
    fetch('/api/brands')
      .then((res) => res.json())
      .then((json) => setBrands(json.brands));
  }, []);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <Link href="/" className="breadcrumb-back">
            ‹ Taxonomy
          </Link>
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
              <span className={`status-badge status-${b.onboarding_status}`}>
                {statusLabel(b.onboarding_status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
