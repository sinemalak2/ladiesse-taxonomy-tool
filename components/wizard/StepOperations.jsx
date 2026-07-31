'use client';

import { useState } from 'react';
import { step5Schema } from '../../lib/brandValidation.js';

export default function StepOperations({ initialData, onSuccess }) {
  const [form, setForm] = useState({
    warehouse_address: initialData.warehouse_address || '',
    avg_processing_days: initialData.avg_processing_days ?? 2,
    shipping_carrier: initialData.shipping_carrier || '',
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

    const parsed = step5Schema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/onboard/me/step/5', {
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
        <label htmlFor="warehouse_address">Warehouse address</label>
        <input
          id="warehouse_address"
          value={form.warehouse_address}
          onChange={set('warehouse_address')}
          autoFocus
        />
        {err('warehouse_address') && <span className="field-error">{err('warehouse_address')}</span>}
      </div>

      <div className="field-row">
        <div className="field-group">
          <label htmlFor="avg_processing_days">Avg processing days (1–14)</label>
          <input
            id="avg_processing_days"
            type="number"
            min="1"
            max="14"
            value={form.avg_processing_days}
            onChange={set('avg_processing_days')}
          />
          {err('avg_processing_days') && <span className="field-error">{err('avg_processing_days')}</span>}
        </div>
        <div className="field-group">
          <label htmlFor="shipping_carrier">Shipping carrier</label>
          <input id="shipping_carrier" value={form.shipping_carrier} onChange={set('shipping_carrier')} />
          {err('shipping_carrier') && <span className="field-error">{err('shipping_carrier')}</span>}
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <button type="submit" className="btn btn-gold" disabled={loading}>
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </form>
  );
}
