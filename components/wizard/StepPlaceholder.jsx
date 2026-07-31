'use client';

// Steps 8 (platform connect) and 9 (product sync) are designed but not yet
// built — they're blocked on provisioning a Shopify Partner app and a
// Vercel Blob store. This keeps the wizard from dead-ending once a brand
// signs their contract and reaches this point.
export default function StepPlaceholder({ title, message }) {
  return (
    <div className="wizard-holding">
      <p style={{ fontWeight: 400, color: 'var(--color-black)', marginBottom: 8 }}>{title}</p>
      <p>{message}</p>
    </div>
  );
}
