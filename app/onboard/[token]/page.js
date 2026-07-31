'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

// The brand's "login" — exchanges the token in the URL for a session
// cookie, then hands off to wherever they left the wizard. A client
// component (rather than a Server Component setting the cookie directly)
// so we can show a loading/error state around the round-trip.
export default function OnboardLandingPage() {
  const { token } = useParams();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/onboard/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid or expired link');
        router.replace(`/onboard/${token}/step/${data.currentStep || 1}`);
      })
      .catch((err) => setError(err.message));
  }, [token, router]);

  return (
    <div className="login-shell">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <h1>Ladiesse</h1>
        {error ? (
          <div className="login-error">{error}. Please contact Ladiesse for a new link.</div>
        ) : (
          <div className="status-text">Loading your onboarding…</div>
        )}
      </div>
    </div>
  );
}
