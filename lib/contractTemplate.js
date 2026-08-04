// Renders the brand agreement as a self-contained HTML string, merging in
// the brand's actual data at generation time. The result is snapshotted
// into brand_contracts.contract_html and never re-rendered from live data
// afterward — see the schema comment on that table for why (a signed
// contract has to reflect exactly what was agreed to, even if commission
// or address fields change on the brand later).
//
// Real legal copy — Ladiesse Brand Licensing & Dropship Marketplace
// Agreement, provided by Sino (Ladiesse_Brand_Licensing_Agreement.docx).
// Bump TEMPLATE_VERSION whenever the underlying legal text changes.
export const TEMPLATE_VERSION = 'v2.0-brand-licensing-agreement';

// Every Licensor is onboarded as a Delaware entity regardless of where the
// brand itself is based — not a per-brand input, so it's fixed here rather
// than collected in the wizard.
const LICENSOR_ENTITY_TYPE = 'a Delaware corporation';

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
  const commissionPct = Number(brand.commission_percentage);
  const licensorPct = Number.isFinite(commissionPct) ? 100 - commissionPct : '';

  const fields = {
    legal_company_name: escapeHtml(brand.legal_company_name),
    legal_address: escapeHtml(brand.legal_address),
    commission_percentage: escapeHtml(brand.commission_percentage),
    licensor_percentage: escapeHtml(licensorPct),
    payout_frequency: escapeHtml(brand.payout_frequency),
    rep_full_name: escapeHtml(brand.rep_full_name || ''),
    rep_title: escapeHtml(brand.rep_title || ''),
    effective_date: formatDate(contractDate),
  };

  return `<!doctype html>
<html>
<head><meta charset="UTF-8"><title>Brand Licensing & Dropship Marketplace Agreement</title></head>
<body style="font-family: Georgia, serif; color: #0f0f10; line-height: 1.6; max-width: 680px; margin: 0 auto;">
<h2 style="font-weight: 400; text-align: center;">BRAND LICENSING &amp; DROPSHIP MARKETPLACE AGREEMENT</h2>
<p style="text-align: center; font-style: italic; color: #55555c;">Between Ladiesse Inc. and Licensor Brand</p>

<p>
  This Brand Licensing &amp; Dropship Marketplace Agreement (this "Agreement") is made effective as of
  ${fields.effective_date} (the "Effective Date") between ${fields.legal_company_name}, ${LICENSOR_ENTITY_TYPE},
  located at ${fields.legal_address} ("Licensor" or "Brand"), and Ladiesse Inc., a Delaware corporation located
  at 101 Alamitos Ave, Apt 425, Long Beach, CA 90802 ("Licensee" or "Ladiesse"), each individually a "Party" and
  collectively the "Parties."
</p>
<p>
  Ladiesse operates a curated online fashion marketplace at ladiesse.com (the "Platform"), through which it
  lists, markets, and facilitates the sale of third-party branded products on a dropship basis. This Agreement
  governs the terms under which Licensor's products and brand assets (the "Authored Work") are listed and sold
  on the Platform.
</p>

<h3 style="font-weight: 400;">1. GRANT OF LICENSE</h3>
<p>
  Licensor owns and has full right, title, and authority to license the Authored Work, including all associated
  product designs, images, descriptions, trademarks, and brand materials. Subject to the terms of this Agreement,
  Licensor grants Ladiesse a non-exclusive, non-transferable, revocable license to list, market, advertise,
  display, and sell the Authored Work on the Platform and in connection with Platform marketing during the Term.
  Licensor retains all title and ownership of the Authored Work. Any derivative works created by Ladiesse in the
  ordinary course of marketing the Authored Work (e.g., resized product images, written product copy) shall be
  owned by Ladiesse but may be used solely in connection with the Platform and shall revert to Licensor's
  approval rights upon request.
</p>

<h3 style="font-weight: 400;">2. TERM</h3>
<p>
  This Agreement shall commence on the Effective Date and shall automatically terminate two (2) years from the
  Effective Date (the "Term"), unless earlier terminated in accordance with Section 17 (Default &amp; Termination
  for Cause), or unless renewed for one or more additional periods by a written amendment signed by both Parties
  prior to expiration.
</p>

<h3 style="font-weight: 400;">3. COMMISSION &amp; PAYMENT OF ROYALTY</h3>
<p>
  Ladiesse will retain a marketplace commission of ${fields.commission_percentage}% of the end consumer's paid
  purchase price on each unit sold through the Platform, with the remaining ${fields.licensor_percentage}%
  remitted to Licensor as royalty. Payment will be made by direct deposit or check within 30 days following the
  close of each ${fields.payout_frequency} billing cycle, to the bank account designated by Licensor in writing.
</p>
<h4 style="font-weight: 400;">3.1 Third-Party Sales</h4>
<p>
  If Ladiesse enters into a secondary distribution agreement with a third-party retail partner within the
  United States that resells the Authored Work, Licensor shall be entitled to a 10% royalty on the end
  consumer's paid purchase price for such sales, in addition to (and not in lieu of) amounts due under this
  Section 3. Ladiesse shall notify Licensor in writing of any such third-party sales arrangement prior to its
  commencement; failure to provide such notice shall constitute a material breach of this Agreement.
</p>
<h4 style="font-weight: 400;">3.2 Wholesale / Bulk Pricing</h4>
<p>
  For bulk orders exceeding USD $1,000 in a single transaction, the commission rate shall be reduced but shall
  not fall below 5%, nor shall it exceed the standard commission rate set out in Section 3.
</p>
<h4 style="font-weight: 400;">3.3 Reporting</h4>
<p>
  Ladiesse will provide Licensor with a monthly sales and commission report itemizing units sold, gross sale
  price, commission retained, and net royalty due, no later than 10 business days after the close of each
  billing cycle.
</p>

<h3 style="font-weight: 400;">4. SHIPPING COSTS</h3>
<p>
  Ladiesse will cover outbound shipping costs to the end consumer up to a maximum of $10.00 USD per order. Any
  shipping cost in excess of $10.00 USD for a given order shall be the responsibility of Licensor and may be
  deducted from the royalty payment due to Licensor for that order, or invoiced separately at Ladiesse's
  discretion.
</p>

<h3 style="font-weight: 400;">5. RETURNS &amp; REFUNDS</h3>
<p>
  Returns will be handled in accordance with applicable U.S. federal and state consumer protection laws.
  Returned items may be sent back to Licensor within a 90-day period following the close of the applicable
  consumer return window. Refunds owed to the end consumer will be processed by Ladiesse and reconciled against
  Licensor's royalty payments.
</p>
<p>
  Consistent with Section 4, Ladiesse will cover return shipping costs up to a maximum of $10.00 USD per
  returned order. Any return shipping cost in excess of $10.00 USD shall be the responsibility of Licensor and
  may be deducted from future royalty payments or invoiced separately. Refund amounts due from Licensor to
  Ladiesse for returned merchandise must cover any applicable duty and shipping costs and may be settled in bulk
  at Ladiesse's discretion.
</p>
<h4 style="font-weight: 400;">5.1 Price Matching</h4>
<p>
  Licensor guarantees that pricing offered to Ladiesse for the Authored Work will be no less favorable than
  pricing offered by Licensor to any other retail or marketplace partner for equivalent goods.
</p>

<h3 style="font-weight: 400;">6. MODIFICATIONS TO AUTHORED WORK</h3>
<p>
  Ladiesse may not modify, alter, or create derivative versions of the Authored Work itself (including product
  design, materials, or construction) without Licensor's prior written consent. This restriction does not limit
  Ladiesse's rights under Section 9 (Marketing; Use of Brand Assets) to use standard marketing formatting of
  product images and copy for Platform display.
</p>

<h3 style="font-weight: 400;">7. PRODUCT COMPLIANCE, SAFETY &amp; WARRANTIES</h3>
<p>
  Licensor represents and warrants that all products supplied under this Agreement: (a) comply with all
  applicable federal, state, and local laws, regulations, and safety standards, including without limitation
  those enforced by the U.S. Consumer Product Safety Commission and FTC labeling requirements; (b) do not
  infringe any third party's intellectual property, publicity, or proprietary rights; (c) are accurately
  described, including materials, sizing, and country of origin; and (d) are free from manufacturing defects.
  Licensor shall promptly notify Ladiesse of any product recall, safety complaint, or regulatory action
  affecting the Authored Work.
</p>

<h3 style="font-weight: 400;">8. INVENTORY &amp; ORDER FULFILLMENT</h3>
<p>
  Licensor is solely responsible for maintaining accurate, real-time inventory availability as communicated to
  Ladiesse, and for fulfilling and shipping orders placed through the Platform within the timeframe specified in
  the applicable Brand Onboarding or Operations Addendum. Repeated stockouts, mis-ships, or fulfillment delays
  attributable to Licensor may be treated as a default under Section 17.
</p>

<h3 style="font-weight: 400;">9. MARKETING; USE OF BRAND ASSETS</h3>
<p>
  Licensor grants Ladiesse a limited, non-exclusive, royalty-free license to use Licensor's name, trademarks,
  logos, product photography, and related brand assets solely for the purpose of marketing and selling the
  Authored Work on the Platform and associated marketing channels (including email, social media, and paid
  advertising). Ladiesse will not use Licensor's brand assets in a manner that disparages Licensor or
  misrepresents the Authored Work. This license terminates automatically upon expiration or termination of this
  Agreement, except with respect to archived marketing materials already published prior to termination.
</p>

<h3 style="font-weight: 400;">10. CONFIDENTIAL INFORMATION</h3>
<p>
  "Confidential Information" means any information or material which is proprietary to either Party, whether or
  not owned or developed by that Party, which is not generally known, and which the receiving Party may obtain
  through any direct or indirect contact with the disclosing Party. Regardless of whether specifically identified
  as confidential, Confidential Information includes business records and plans, trade secrets, technical data,
  product ideas, contracts, financial information, pricing structure, discounts, source code and/or object code,
  copyrights and intellectual property, sales leads, strategic alliances, partners, and customer or client lists.
  The nature of the information and manner of disclosure are such that a reasonable person would understand it
  to be confidential.
</p>
<p>Confidential Information does not include information that:</p>
<ul>
  <li>is or becomes public knowledge through no fault of the receiving Party;</li>
  <li>is rightfully received by the receiving Party from a third party without a duty of confidentiality;</li>
  <li>is independently developed by the receiving Party without use of the disclosing Party's Confidential Information;</li>
  <li>is required to be disclosed by operation of law, provided reasonable notice is given to the disclosing Party where legally permitted;</li>
  <li>is disclosed with the prior written consent of the disclosing Party;</li>
  <li>both Parties agree in writing is not confidential.</li>
</ul>

<h3 style="font-weight: 400;">11. PROTECTION OF CONFIDENTIAL INFORMATION</h3>
<p>
  Each Party acknowledges that the other Party's Confidential Information has been developed or obtained through
  significant investment of time, effort, and expense, and is a valuable, special, and unique asset providing a
  competitive advantage that must be protected from improper disclosure.
</p>
<h4 style="font-weight: 400;">11.1 No Disclosure</h4>
<p>
  Each Party will hold the other Party's Confidential Information in confidence and will not disclose it to any
  person or entity without the prior written consent of the disclosing Party.
</p>
<h4 style="font-weight: 400;">11.2 No Copying / Modifying</h4>
<p>Neither Party will copy or modify the other Party's Confidential Information without prior written consent.</p>
<h4 style="font-weight: 400;">11.3 Unauthorized Use</h4>
<p>
  Each Party shall promptly advise the other Party if it becomes aware of any possible unauthorized disclosure
  or use of Confidential Information.
</p>
<h4 style="font-weight: 400;">11.4 Application to Employees &amp; Contractors</h4>
<p>
  Neither Party shall disclose Confidential Information to employees or contractors except those who require it
  to perform duties connected with this Agreement, and each such individual shall be bound by confidentiality
  obligations at least as protective as those in this Agreement.
</p>

<h3 style="font-weight: 400;">12. INTELLECTUAL PROPERTY OWNERSHIP</h3>
<p>
  Except for the limited marketing license granted in Section 9, nothing in this Agreement transfers ownership
  of either Party's trademarks, trade names, copyrights, or other intellectual property. Ladiesse's proprietary
  technology, including its search, recommendation, and personalization systems (the "Taste Graph"), any related
  data, models, and platform software, are and remain the sole property of Ladiesse. Licensor's product designs,
  trademarks, and brand materials are and remain the sole property of Licensor.
</p>

<h3 style="font-weight: 400;">13. INDEMNIFICATION</h3>
<p>
  Licensor shall indemnify, defend, and hold harmless Ladiesse, its officers, directors, employees, and agents
  from and against any claims, damages, losses, and expenses (including reasonable attorneys' fees) arising out
  of or related to: (a) any breach of Licensor's representations or warranties under this Agreement; (b) any
  claim that the Authored Work infringes a third party's intellectual property rights; (c) any product
  liability, safety, or defect claim relating to the Authored Work; or (d) Licensor's negligence or willful
  misconduct. Ladiesse shall indemnify, defend, and hold harmless Licensor from claims arising out of Ladiesse's
  gross negligence, willful misconduct, or material breach of this Agreement in its operation of the Platform.
</p>

<h3 style="font-weight: 400;">14. INSURANCE</h3>
<p>
  Licensor shall maintain, at its own expense, commercial general liability insurance (including product
  liability coverage) with limits of not less than $1,000,000 per occurrence and $2,000,000 in the aggregate.
  Ladiesse Inc. shall be named as an additional insured on such policy. Upon request, Licensor shall provide
  Ladiesse with a certificate of insurance evidencing this coverage, and shall provide at least 30 days' written
  notice prior to any cancellation, non-renewal, or material reduction in coverage.
</p>

<h3 style="font-weight: 400;">15. INDEPENDENT CONTRACTOR RELATIONSHIP</h3>
<p>
  The Parties are independent contractors. Nothing in this Agreement creates a partnership, joint venture,
  employment, or agency relationship between the Parties. Neither Party has authority to bind the other except
  as expressly set out herein.
</p>

<h3 style="font-weight: 400;">16. WARRANTIES; LIMITATION OF LIABILITY</h3>
<p>
  EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, NEITHER PARTY MAKES ANY WARRANTY, EXPRESS OR IMPLIED, WITH
  RESPECT TO THE AUTHORED WORK OR THE PLATFORM. IN NO EVENT SHALL EITHER PARTY BE LIABLE TO THE OTHER FOR ANY
  INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THIS AGREEMENT, EXCEPT WITH RESPECT TO
  (A) BREACHES OF SECTION 10–11 (CONFIDENTIALITY), (B) INDEMNIFICATION OBLIGATIONS UNDER SECTION 13, OR (C) A
  PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT.
</p>

<h3 style="font-weight: 400;">17. DEFAULT &amp; TERMINATION FOR CAUSE</h3>
<p>
  If either Party fails to abide by its obligations under this Agreement, including the obligation to make
  timely royalty payments or fulfill orders, the non-breaching Party may terminate this Agreement by providing
  30 days' written notice specifying the default. The breaching Party may avoid termination by curing the
  default within that 30-day period, provided no further defaults occur during that time. Either Party may
  terminate this Agreement immediately upon written notice if the other Party becomes insolvent, files for
  bankruptcy, or ceases normal business operations.
</p>

<h3 style="font-weight: 400;">18. EFFECT OF TERMINATION</h3>
<p>
  Upon expiration or termination of this Agreement: (a) Ladiesse shall remove all Authored Work listings from
  the Platform within 10 business days; (b) any royalties accrued but unpaid as of the termination date shall be
  paid within 30 days; (c) each Party shall return or destroy the other Party's Confidential Information upon
  request; and (d) Sections 10–14, 16, and 20–27 shall survive termination.
</p>

<h3 style="font-weight: 400;">19. TRANSFER OF RIGHTS</h3>
<p>
  This Agreement shall be binding on any successors of the Parties. Neither Party shall assign its interests in
  this Agreement without the prior written consent of the other Party, except that either Party may assign this
  Agreement without consent in connection with a merger, acquisition, or sale of substantially all of its
  assets.
</p>

<h3 style="font-weight: 400;">20. FORCE MAJEURE</h3>
<p>
  Neither Party shall be liable for any failure or delay in performance under this Agreement due to causes
  beyond its reasonable control, including acts of God, natural disaster, war, terrorism, labor disputes,
  governmental action, or failure of third-party carriers, provided the affected Party promptly notifies the
  other Party and uses commercially reasonable efforts to resume performance.
</p>

<h3 style="font-weight: 400;">21. DISPUTE RESOLUTION; GOVERNING LAW; VENUE</h3>
<p>
  The Parties will attempt in good faith to resolve any dispute arising out of this Agreement through direct
  negotiation for 30 days before pursuing formal proceedings. This Agreement shall be governed by the laws of
  the State of California, without regard to its conflict of laws principles. The Parties consent to the
  exclusive jurisdiction and venue of the state and federal courts located in Los Angeles County, California.
</p>

<h3 style="font-weight: 400;">22. NOTICES</h3>
<p>
  All notices under this Agreement shall be in writing and delivered by email with confirmation of receipt, or
  by certified mail, to the addresses set forth in the preamble of this Agreement (or such other address as a
  Party may designate in writing).
</p>

<h3 style="font-weight: 400;">23. ENTIRE AGREEMENT</h3>
<p>
  This Agreement, together with any Brand Onboarding or Operations Addendum referenced herein, contains the
  entire agreement of the Parties and supersedes any prior written or oral agreements between the Parties
  relating to its subject matter.
</p>

<h3 style="font-weight: 400;">24. AMENDMENT</h3>
<p>This Agreement may be modified or amended only by a written instrument signed by both Parties.</p>

<h3 style="font-weight: 400;">25. SEVERABILITY</h3>
<p>
  If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall continue
  in full force and effect. If limiting a provision would render it valid or enforceable, it shall be deemed so
  limited.
</p>

<h3 style="font-weight: 400;">26. WAIVER</h3>
<p>
  The failure of either Party to enforce any provision of this Agreement shall not be construed as a waiver of
  that Party's right to subsequently enforce and compel strict compliance with every provision of this
  Agreement.
</p>

<h3 style="font-weight: 400;">27. COUNTERPARTS; ELECTRONIC SIGNATURE</h3>
<p>
  This Agreement may be executed in counterparts, each of which shall be deemed an original, and all of which
  together constitute one instrument. Signatures delivered by electronic means (including DocuSign or scanned
  PDF) shall be deemed valid and binding.
</p>

<h3 style="font-weight: 400;">28. SIGNATORIES</h3>
<p>
  This Agreement is signed on behalf of Licensor and Ladiesse Inc. by their respective authorized
  representatives, effective as of the Effective Date first written above.
</p>

<p style="margin-bottom: 2px;">Licensor:</p>
<p style="margin-bottom: 2px;">By: ______________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date: ______________</p>
<p style="margin: 2px 0;">${fields.legal_company_name}</p>
<p style="margin: 2px 0 24px;">${fields.rep_full_name}, ${fields.rep_title}</p>

<p style="margin-bottom: 2px;">Licensee: Ladiesse Inc.</p>
<p style="margin-bottom: 2px;">By: ______________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date: ______________</p>
<p style="margin: 2px 0;">Aynur Sinem Alak, Founder &amp; CEO</p>
</body>
</html>`;
}
