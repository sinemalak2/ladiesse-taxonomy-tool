'use client';

import { useState } from 'react';
import { makeStep4Schema } from '../../lib/brandValidation.js';

export default function StepLegalEntity({ initialData, country, onSuccess }) {
  const isUS = country === 'US';
  const schema = makeStep4Schema(country);

  const [form, setForm] = useState({
    legal_company_name: initialData.legal_company_name || '',
    legal_address: initialData.legal_address || '',
    tax_id: initialData.tax_id || '',
    tax_office: initialData.tax_office || '',
    trade_registry_no: initialData.trade_registry_no || '',
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

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/onboard/me/step/4', {
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
        <label htmlFor="legal_company_name">Legal company name</label>
        <input
          id="legal_company_name"
          value={form.legal_company_name}
          onChange={set('legal_company_name')}
          autoFocus
        />
        {err('legal_company_name') && <span className="field-error">{err('legal_company_name')}</span>}
      </div>

      <div className="field-group">
        <label htmlFor="legal_address">Legal address</label>
        <input id="legal_address" value={form.legal_address} onChange={set('legal_address')} />
        {err('legal_address') && <span className="field-error">{err('legal_address')}</span>}
      </div>

      <div className="field-row">
        <div className="field-group">
          <label htmlFor="tax_id">
            {isUS ? 'EIN (9 digits, e.g. 12-3456789)' : 'Tax ID — VKN (company, 10 digits) or TC Kimlik No (individual, 11 digits)'}
          </label>
          <input id="tax_id" value={form.tax_id} onChange={set('tax_id')} placeholder={isUS ? '12-3456789' : ''} />
          {err('tax_id') && <span className="field-error">{err('tax_id')}</span>}
        </div>
        {!isUS && (
          <div className="field-group">
            <label htmlFor="tax_office">Tax office</label>
            <input id="tax_office" value={form.tax_office} onChange={set('tax_office')} />
            {err('tax_office') && <span className="field-error">{err('tax_office')}</span>}
          </div>
        )}
      </div>

      <div className="field-group">
        <label htmlFor="trade_registry_no">Trade registry no (optional)</label>
        <input id="trade_registry_no" value={form.trade_registry_no} onChange={set('trade_registry_no')} />
        {err('trade_registry_no') && <span className="field-error">{err('trade_registry_no')}</span>}
      </div>

      {error && <div className="login-error">{error}</div>}

      <button type="submit" className="btn btn-gold" disabled={loading}>
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </form>
  );
}
