'use client';

import { useState } from 'react';
import { step3Schema } from '../../lib/brandValidation.js';

export default function StepContactInfo({ initialData, onSuccess }) {
  const [form, setForm] = useState({
    full_name: initialData.full_name || '',
    title: initialData.title || '',
    phone_number: initialData.phone_number || '',
    email: initialData.email || '',
    role: initialData.role || 'primary',
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

    const parsed = step3Schema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/onboard/me/step/3', {
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
        <label htmlFor="full_name">Your full name</label>
        <input id="full_name" value={form.full_name} onChange={set('full_name')} autoFocus />
        {err('full_name') && <span className="field-error">{err('full_name')}</span>}
      </div>

      <div className="field-group">
        <label htmlFor="title">Your title</label>
        <input id="title" placeholder="Founder & CEO" value={form.title} onChange={set('title')} />
        {err('title') && <span className="field-error">{err('title')}</span>}
      </div>

      <div className="field-row">
        <div className="field-group">
          <label htmlFor="phone_number">Phone</label>
          <input
            id="phone_number"
            placeholder="+905551234567"
            value={form.phone_number}
            onChange={set('phone_number')}
          />
          {err('phone_number') && <span className="field-error">{err('phone_number')}</span>}
        </div>
        <div className="field-group">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={form.email} onChange={set('email')} />
          {err('email') && <span className="field-error">{err('email')}</span>}
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <button type="submit" className="btn btn-gold" disabled={loading}>
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </form>
  );
}
