'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import WizardShell from '../../../../../components/wizard/WizardShell.jsx';
import StepWelcome from '../../../../../components/wizard/StepWelcome.jsx';
import StepBrandIdentity from '../../../../../components/wizard/StepBrandIdentity.jsx';
import StepContactInfo from '../../../../../components/wizard/StepContactInfo.jsx';
import StepLegalEntity from '../../../../../components/wizard/StepLegalEntity.jsx';
import StepOperations from '../../../../../components/wizard/StepOperations.jsx';
import StepBankDetails from '../../../../../components/wizard/StepBankDetails.jsx';
import StepContract from '../../../../../components/wizard/StepContract.jsx';
import StepPlatformConnect from '../../../../../components/wizard/StepPlatformConnect.jsx';
import StepProductSync from '../../../../../components/wizard/StepProductSync.jsx';
import StepPlaceholder from '../../../../../components/wizard/StepPlaceholder.jsx';

export default function OnboardStepPage() {
  const { token, step: stepParam } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = Number(stepParam);
  const connectError = searchParams.get('error');

  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setPayload(null);
    setError('');
    fetch(`/api/onboard/me/step/${step}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.replace(`/onboard/${token}`);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load this step');
        setPayload(data);
      })
      .catch((err) => setError(err.message));
  }, [step, token, router]);

  useEffect(() => {
    load();
  }, [load]);

  function onSuccess(nextStep) {
    router.push(`/onboard/${token}/step/${nextStep}`);
  }

  if (error) {
    return (
      <div className="page-shell">
        <div className="login-error">{error}</div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="page-shell">
        <div className="status-text">Loading…</div>
      </div>
    );
  }

  let content;
  switch (step) {
    case 1:
      content = <StepWelcome onSuccess={onSuccess} />;
      break;
    case 2:
      content = <StepBrandIdentity initialData={payload.data} onSuccess={onSuccess} />;
      break;
    case 3:
      content = <StepContactInfo initialData={payload.data} onSuccess={onSuccess} />;
      break;
    case 4:
      content = <StepLegalEntity initialData={payload.data} country={payload.country} onSuccess={onSuccess} />;
      break;
    case 5:
      content = <StepOperations initialData={payload.data} onSuccess={onSuccess} />;
      break;
    case 6:
      content = <StepBankDetails initialData={payload.data} country={payload.country} onSuccess={onSuccess} />;
      break;
    case 7:
      content = <StepContract payload={payload} onSuccess={onSuccess} onRefresh={load} />;
      break;
    case 8:
      content = (
        <>
          {connectError && (
            <div className="login-error" style={{ marginBottom: 16 }}>
              We couldn't connect to Shopify. Please check the domain and try again.
            </div>
          )}
          <StepPlatformConnect payload={payload} />
        </>
      );
      break;
    case 9:
      content = <StepProductSync payload={payload} onSuccess={onSuccess} />;
      break;
    case 10:
      content = (
        <StepPlaceholder
          title="You're all set"
          message="Thanks for completing onboarding. Ladiesse will review everything and let you know when your store goes live."
        />
      );
      break;
    default:
      content = <div className="login-error">Unknown step.</div>;
  }

  return (
    <WizardShell step={step}>
      {content}
    </WizardShell>
  );
}
