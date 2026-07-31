'use client';

import { useState } from 'react';
import { step2Schema, CATEGORY_OPTIONS } from '../../lib/brandValidation.js';

export default function StepBrandIdentity({ initialData, onSuccess }) {
  const [form, setForm] = useState({
    brand_name: initialData.brand_name || '',
    category: initialData.category || '',
    website_url: initialData.website_url || '',
    instagram_handle: initialData.instagram_handle || '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const err = (field) => fieldErrors[field]?.[0];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const parsed = step2Schema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/onboard/me/step/2', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors) setFieldErrors(data.errors);
        else setError(data.error || 'Could not save');
        setLoading(false);
        return;
      }
      onSuccess(data.currentStep);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="brand_name">Brand name</label>
        <input id="brand_name" value={form.brand_name} onChange={set('brand_name')} autoFocus />
        {err('brand_name') && <span className="field-error">{err('brand_name')}</span>}
      </div>

      <div className="field-row">
        <div className="field-group">
          <label htmlFor="category">Category</label>
          <select id="category" value={form.category} onChange={set('category')}>
            <option value="" disabled>
              Select a category
            </option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {err('category') && <span className="field-error">{err('category')}</span>}
        </div>
        <div className="field-group">
          <label htmlFor="instagram_handle">Instagram</label>
          <input
            id="instagram_handle"
            placeholder="@brand"
            value={form.instagram_handle}
            onChange={set('instagram_handle')}
          />
          {err('instagram_handle') && <span className="field-error">{err('instagram_handle')}</span>}
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="website_url">Website</label>
        <input id="website_url" placeholder="https://" value={form.website_url} onChange={set('website_url')} />
        {err('website_url') && <span className="field-error">{err('website_url')}</span>}
      </div>

      {error && <div className="login-error">{error}</div>}

      <button type="submit" className="btn btn-gold" disabled={loading}>
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </form>
  );
}
