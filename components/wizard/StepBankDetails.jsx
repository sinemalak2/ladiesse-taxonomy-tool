'use client';

import { useState } from 'react';
import { step6Schema } from '../../lib/brandValidation.js';

export default function StepBankDetails({ initialData, onSuccess }) {
  const [form, setForm] = useState({
    account_holder_name: initialData.account_holder_name || '',
    iban: initialData.iban || '',
    bank_name: initialData.bank_name || '',
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

    const parsed = step6Schema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/onboard/me/step/6', {
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
        <label htmlFor="account_holder_name">Account holder name</label>
        <input
          id="account_holder_name"
          value={form.account_holder_name}
          onChange={set('account_holder_name')}
          autoFocus
        />
        {err('account_holder_name') && <span className="field-error">{err('account_holder_name')}</span>}
      </div>

      <div className="field-row">
        <div className="field-group">
          <label htmlFor="iban">IBAN</label>
          <input id="iban" placeholder="TR..." value={form.iban} onChange={set('iban')} />
          {err('iban') && <span className="field-error">{err('iban')}</span>}
        </div>
        <div className="field-group">
          <label htmlFor="bank_name">Bank name</label>
          <input id="bank_name" value={form.bank_name} onChange={set('bank_name')} />
          {err('bank_name') && <span className="field-error">{err('bank_name')}</span>}
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <button type="submit" className="btn btn-gold" disabled={loading}>
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </form>
  );
}
