'use client';

import { useEffect, useRef, useState } from 'react';

// Polls the brand's own step-9 GET endpoint (which reads the latest
// product_sync_jobs row) every 5s until the sync reaches a terminal state.
// No separate "sync status" endpoint needed — step/9's GET already returns
// `job`, so re-fetching it is enough.
export default function StepProductSync({ payload, onSuccess }) {
  const [job, setJob] = useState(payload.job);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (job && (job.status === 'completed' || job.status === 'failed')) return;

    intervalRef.current = setInterval(() => {
      fetch('/api/onboard/me/step/9')
        .then((res) => res.json())
        .then((data) => setJob(data.job));
    }, 5000);

    return () => clearInterval(intervalRef.current);
  }, [job]);

  if (!job) {
    return <div className="wizard-holding">Waiting for your product sync to start…</div>;
  }

  if (job.status === 'pending' || job.status === 'running') {
    return (
      <div className="wizard-holding">
        Syncing your products from Shopify… this can take a minute for larger catalogues.
      </div>
    );
  }

  if (job.status === 'failed') {
    return (
      <div className="wizard-holding">
        <p style={{ fontWeight: 400, color: 'var(--color-danger)', marginBottom: 8 }}>Sync failed</p>
        <p>{job.error_message || 'Something went wrong during sync.'} Ladiesse has been notified.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="wizard-holding" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 400, color: 'var(--color-black)', marginBottom: 8 }}>Sync complete</p>
        <p>
          {job.products_created} product{job.products_created === 1 ? '' : 's'} imported
          {job.products_updated ? `, ${job.products_updated} updated` : ''}.
        </p>
      </div>
      <button type="button" className="btn btn-gold" onClick={() => onSuccess(10)}>
        Continue
      </button>
    </div>
  );
}
