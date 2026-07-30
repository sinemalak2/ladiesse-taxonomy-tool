'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function NewBrandPage() {
  const [form, setForm] = useState({
    brandName: '',
    category: '',
    websiteUrl: '',
    instagramHandle: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not create brand');
      }

      window.location.href = '/brands';
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <Link href="/brands" className="breadcrumb-back">
            ‹ Brands
          </Link>
          <h1>Add Brand</h1>
          <div className="tagline">Stage 1 · Application / Intake</div>
        </div>
      </div>

      <form className="form-card" onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="brandName">Brand name</label>
          <input id="brandName" value={form.brandName} onChange={set('brandName')} required autoFocus />
        </div>

        <div className="field-row">
          <div className="field-group">
            <label htmlFor="category">Category</label>
            <input
              id="category"
              placeholder="e.g. Ready-to-wear"
              value={form.category}
              onChange={set('category')}
            />
          </div>
          <div className="field-group">
            <label htmlFor="instagramHandle">Instagram</label>
            <input
              id="instagramHandle"
              placeholder="@brand"
              value={form.instagramHandle}
              onChange={set('instagramHandle')}
            />
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="websiteUrl">Website</label>
          <input
            id="websiteUrl"
            type="url"
            placeholder="https://"
            value={form.websiteUrl}
            onChange={set('websiteUrl')}
          />
        </div>

        <div className="field-group">
          <label htmlFor="contactName">Rep full name</label>
          <input id="contactName" value={form.contactName} onChange={set('contactName')} required />
        </div>

        <div className="field-row">
          <div className="field-group">
            <label htmlFor="contactEmail">Rep email</label>
            <input
              id="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={set('contactEmail')}
            />
          </div>
          <div className="field-group">
            <label htmlFor="contactPhone">Rep phone</label>
            <input
              id="contactPhone"
              placeholder="+90 5xx xxx xx xx"
              value={form.contactPhone}
              onChange={set('contactPhone')}
              required
            />
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="btn btn-gold" disabled={loading}>
          {loading ? 'Saving…' : 'Add Brand'}
        </button>
      </form>
    </div>
  );
}
