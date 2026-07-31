'use client';

export const STEP_NAMES = [
  'Welcome',
  'Brand Identity',
  'Contact',
  'Legal Entity',
  'Operations',
  'Bank Details',
  'Contract',
  'Connect Shopify',
  'Product Sync',
  'Done',
];

// Purely presentational — progress bar + step list. Each step component
// handles its own form state and submission; this just frames it.
export default function WizardShell({ step, brandName, children }) {
  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>{brandName || 'Brand Onboarding'}</h1>
          <div className="tagline">
            Step {step} of {STEP_NAMES.length} · {STEP_NAMES[step - 1]}
          </div>
        </div>
      </div>

      <div className="wizard-progress">
        <div className="wizard-progress-bar" style={{ width: `${(step / STEP_NAMES.length) * 100}%` }} />
      </div>

      <div className="form-card">{children}</div>
    </div>
  );
}
