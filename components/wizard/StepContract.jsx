'use client';

import { useState } from 'react';
import { step7Schema } from '../../lib/brandValidation.js';

export default function StepContract({ payload, onSuccess }) {
  const [signedByName, setSignedByName] = useState('');
  const [agreedToContract, setAgreedToContract] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (payload.gated) {
    return <div className="wizard-holding">{payload.message}</div>;
  }

  if (payload.alreadySigned) {
    return (
      <div>
        <p style={{ marginBottom: 16, color: 'var(--color-mid)', fontSize: 13 }}>
          Signed by {payload.signedByName} on {new Date(payload.signedAt).toLocaleDateString()}.
        </p>
        <div className="contract-scroll" dangerouslySetInnerHTML={{ __html: payload.contractHtml }} />
        <button type="button" className="btn btn-gold" style={{ marginTop: 16 }} onClick={() => onSuccess(8)}>
          Continue
        </button>
      </div>
    );
  }

  const err = (field) => fieldErrors[field]?.[0];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const form = { signed_by_name: signedByName, agreed_to_contract: agreedToContract };
    const parsed = step7Schema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/onboard/me/step/7', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors) setFieldErrors(data.errors);
        else setError(data.error || 'Could not sign');
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
    <div>
      <div className="commercial-terms-summary" style={{ marginBottom: 16 }}>
        <div>
          <span className="label">Commission</span>
          {payload.commercialTerms.commission_percentage}%
        </div>
        <div>
          <span className="label">Payout frequency</span>
          {payload.commercialTerms.payout_frequency}
        </div>
      </div>

      <div className="contract-scroll" dangerouslySetInnerHTML={{ __html: payload.contractHtml }} />

      <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
        <div className="field-group">
          <label htmlFor="signed_by_name">Type your full legal name to sign</label>
          <input id="signed_by_name" value={signedByName} onChange={(e) => setSignedByName(e.target.value)} />
          {err('signed_by_name') && <span className="field-error">{err('signed_by_name')}</span>}
        </div>

        <div className="field-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            id="agreed_to_contract"
            type="checkbox"
            checked={agreedToContract}
            onChange={(e) => setAgreedToContract(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="agreed_to_contract" style={{ margin: 0 }}>
            I have read and agree to the contract above
          </label>
        </div>
        {err('agreed_to_contract') && <span className="field-error">{err('agreed_to_contract')}</span>}

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="btn btn-gold" disabled={loading} style={{ marginTop: 12 }}>
          {loading ? 'Signing…' : 'Sign & Continue'}
        </button>
      </form>
    </div>
  );
}
