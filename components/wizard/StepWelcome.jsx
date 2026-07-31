'use client';

import { useState } from 'react';

export default function StepWelcome({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleStart() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/onboard/me/step/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreed_to_start: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start');
      onSuccess(data.currentStep);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        Welcome to Ladiesse. This short wizard collects everything we need to bring your brand
        onto the platform: your legal and payout details, a contract to sign, and — once that's
        in place — connecting your Shopify store so we can pull in your catalogue.
      </p>
      <p style={{ marginBottom: 24, color: 'var(--color-mid)', fontSize: 13 }}>
        You can leave and come back at any time using the same link — nothing is lost.
      </p>
      {error && <div className="login-error">{error}</div>}
      <button type="button" className="btn btn-gold" onClick={handleStart} disabled={loading}>
        {loading ? 'Starting…' : "Let's get started"}
      </button>
    </div>
  );
}
