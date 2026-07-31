// Renders the brand agreement as a self-contained HTML string, merging in
// the brand's actual data at generation time. The result is snapshotted
// into brand_contracts.contract_html and never re-rendered from live data
// afterward — see the schema comment on that table for why (a signed
// contract has to reflect exactly what was agreed to, even if commission
// or address fields change on the brand later).
//
// PLACEHOLDER LEGAL LANGUAGE — swap TEMPLATE_VERSION and the template
// string below when Ipek/Sino provide real contract copy. No other code
// needs to change.
export const TEMPLATE_VERSION = 'v1.0-placeholder';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function generateContractHtml(brand, contractDate) {
  const fields = {
    legal_company_name: escapeHtml(brand.legal_company_name),
    legal_address: escapeHtml(brand.legal_address),
    tax_id: escapeHtml(brand.tax_id),
    commission_percentage: escapeHtml(brand.commission_percentage),
    payout_frequency: escapeHtml(brand.payout_frequency),
    rep_full_name: escapeHtml(brand.rep_full_name || ''),
    effective_date: formatDate(contractDate),
  };

  return `<!doctype html>
<html>
<head><meta charset="UTF-8"><title>Ladiesse Marketplace Brand Agreement</title></head>
<body style="font-family: Georgia, serif; color: #0f0f10; line-height: 1.6; max-width: 680px; margin: 0 auto;">
<p style="text-align:center; font-size: 11px; letter-spacing: 0.08em; color: #88888f; text-transform: uppercase;">
  Draft agreement — subject to update. Placeholder legal language, not final.
</p>
<h2 style="font-weight: 400;">LADIESSE MARKETPLACE BRAND AGREEMENT</h2>
<p>
  This agreement is entered into between Ladiesse Inc. ("Ladiesse") and
  ${fields.legal_company_name} ("Brand"), a company registered at ${fields.legal_address}
  with tax ID ${fields.tax_id}, effective as of ${fields.effective_date}.
</p>
<h3 style="font-weight: 400;">1. Commission</h3>
<p>
  Ladiesse will retain a commission of ${fields.commission_percentage}% on the gross sale
  price of each unit sold through the Ladiesse platform.
</p>
<h3 style="font-weight: 400;">2. Payout</h3>
<p>
  Brand will be paid on a ${fields.payout_frequency} basis for net sales, less applicable
  commission and any returns/chargebacks.
</p>
<h3 style="font-weight: 400;">3. Product Data</h3>
<p>
  Brand authorizes Ladiesse to sync product listings, images, descriptions, pricing, and
  inventory levels from Brand's connected e-commerce platform.
</p>
<h3 style="font-weight: 400;">4. Fulfillment</h3>
<p>
  Brand is responsible for fulfilling orders from the warehouse address provided during
  onboarding within the agreed processing window.
</p>
<h3 style="font-weight: 400;">5. Term &amp; Termination</h3>
<p>[Placeholder — to be defined with legal counsel]</p>
<p>
  By signing below, ${fields.rep_full_name}, on behalf of ${fields.legal_company_name},
  agrees to the terms above.
</p>
</body>
</html>`;
}
