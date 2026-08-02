'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { COUNTRY_OPTIONS } from '../../../lib/brandValidation.js';

const PAYOUT_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];
const COUNTRY_LABELS = { TR: 'Turkey', US: 'United States' };

const EDITABLE_FIELDS = [
  'country',
  'legal_company_name',
  'legal_address',
  'tax_id',
  'tax_office',
  'trade_registry_no',
  'warehouse_address',
  'avg_processing_days',
  'shipping_carrier',
  'payout_frequency',
  'notes',
  'account_holder_name',
  'iban',
  'routing_number',
  'account_number',
  'bank_name',
];

function toFormValue(brand) {
  const form = {};
  for (const field of EDITABLE_FIELDS) {
    form[field] = brand[field] ?? '';
  }
  return form;
}

export default function BrandDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [brand, setBrand] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [deletingProducts, setDeletingProducts] = useState(false);
  const [deleteProductsMessage, setDeleteProductsMessage] = useState('');
  const [deletingShopifyProducts, setDeletingShopifyProducts] = useState(false);
  const [deleteShopifyProductsMessage, setDeleteShopifyProductsMessage] = useState('');
  const [deletingBrand, setDeletingBrand] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${id}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          return;
        }
        setBrand(json.brand);
        setForm(toFormValue(json.brand));
      });
  }, [id]);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    setSavedAt(null);

    try {
      const res = await fetch(`/api/brands/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save brand');
      }

      // The PATCH response only echoes back a few fields — refetch the full
      // record so the page (including the read-only Onboarding section
      // below the form) actually reflects what was just saved, instead of
      // showing whatever was fetched on the initial page load.
      const refreshed = await fetch(`/api/brands/${id}`).then((r) => r.json());
      if (!refreshed.error) {
        setBrand(refreshed.brand);
        setForm(toFormValue(refreshed.brand));
      }

      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function copyOnboardLink() {
    const fullUrl = `${window.location.origin}/onboard/${brand.onboarding_token}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/brands/${id}/regenerate-token`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setBrand((b) => ({ ...b, onboarding_token: data.onboarding_token }));
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncError('');
    try {
      const res = await fetch(`/api/brands/${id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      const refreshed = await fetch(`/api/brands/${id}`).then((r) => r.json());
      if (!refreshed.error) setBrand(refreshed.brand);
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDeleteProducts() {
    const ok = window.confirm(
      `Clear ${brand.brand_name}'s synced products from the database? This does not touch la-diesse.myshopify.com or the brand's own store — just our local copy, so a future sync starts clean.`
    );
    if (!ok) return;

    setDeletingProducts(true);
    setDeleteProductsMessage('');
    try {
      const res = await fetch(`/api/brands/${id}/delete-products`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setDeleteProductsMessage(`Cleared ${data.deleted} product(s) from the database.`);

      const refreshed = await fetch(`/api/brands/${id}`).then((r) => r.json());
      if (!refreshed.error) setBrand(refreshed.brand);
    } catch (err) {
      setDeleteProductsMessage(err.message);
    } finally {
      setDeletingProducts(false);
    }
  }

  async function handleDeleteShopifyProducts() {
    const ok = window.confirm(
      `Delete all of ${brand.brand_name}'s products from la-diesse.myshopify.com? This is a real, live delete and cannot be undone.`
    );
    if (!ok) return;

    setDeletingShopifyProducts(true);
    setDeleteShopifyProductsMessage('');
    try {
      const res = await fetch(`/api/brands/${id}/delete-shopify-products`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      const failedNote = data.errors.length > 0 ? ` (${data.errors.length} failed — see logs)` : '';
      setDeleteShopifyProductsMessage(`Deleted ${data.deleted} of ${data.total} product(s) from la-diesse.${failedNote}`);

      const refreshed = await fetch(`/api/brands/${id}`).then((r) => r.json());
      if (!refreshed.error) setBrand(refreshed.brand);
    } catch (err) {
      setDeleteShopifyProductsMessage(err.message);
    } finally {
      setDeletingShopifyProducts(false);
    }
  }

  async function handleDeleteBrand() {
    const ok = window.confirm(
      `Permanently delete "${brand.brand_name}"? This removes the brand, its contacts, contract, bank details, and platform connection, and deletes any of its products from la-diesse.myshopify.com. This cannot be undone.`
    );
    if (!ok) return;

    setDeletingBrand(true);
    try {
      const res = await fetch(`/api/brands/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      router.push('/brands');
    } catch (err) {
      setError(err.message);
      setDeletingBrand(false);
    }
  }

  if (error && !brand) {
    return (
      <div className="page-shell">
        <Link href="/brands" className="breadcrumb-back">
          ‹ Brands
        </Link>
        <div className="login-error">{error}</div>
      </div>
    );
  }

  if (!brand || !form) {
    return (
      <div className="page-shell">
        <div className="status-text">Loading…</div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <Link href="/brands" className="breadcrumb-back">
            ‹ Brands
          </Link>
          <h1>{brand.brand_name}</h1>
          <div className="tagline">
            {brand.category || 'Uncategorized'} · {brand.onboarding_status.replace(/_/g, ' ')}
          </div>
        </div>
      </div>

      <form className="form-card" onSubmit={handleSave}>
        <div className="section-heading">Legal entity</div>
        <div className="field-row">
          <div className="field-group">
            <label htmlFor="legal_company_name">Legal company name</label>
            <input
              id="legal_company_name"
              value={form.legal_company_name}
              onChange={set('legal_company_name')}
            />
          </div>
          <div className="field-group">
            <label htmlFor="country">Country</label>
            <select id="country" value={form.country} onChange={set('country')}>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {COUNTRY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="legal_address">Legal address</label>
          <input id="legal_address" value={form.legal_address} onChange={set('legal_address')} />
        </div>
        <div className="field-row">
          <div className="field-group">
            <label htmlFor="tax_id">{form.country === 'US' ? 'EIN' : 'Tax ID (VKN/TCKN)'}</label>
            <input id="tax_id" value={form.tax_id} onChange={set('tax_id')} />
          </div>
          {form.country !== 'US' && (
            <div className="field-group">
              <label htmlFor="tax_office">Tax office</label>
              <input id="tax_office" value={form.tax_office} onChange={set('tax_office')} />
            </div>
          )}
        </div>
        <div className="field-group">
          <label htmlFor="trade_registry_no">Trade registry no</label>
          <input
            id="trade_registry_no"
            value={form.trade_registry_no}
            onChange={set('trade_registry_no')}
          />
        </div>

        <div className="section-heading">Operations</div>
        <div className="field-group">
          <label htmlFor="warehouse_address">Warehouse address</label>
          <input
            id="warehouse_address"
            value={form.warehouse_address}
            onChange={set('warehouse_address')}
          />
        </div>
        <div className="field-row">
          <div className="field-group">
            <label htmlFor="avg_processing_days">Avg processing days</label>
            <input
              id="avg_processing_days"
              type="number"
              min="0"
              value={form.avg_processing_days}
              onChange={set('avg_processing_days')}
            />
          </div>
          <div className="field-group">
            <label htmlFor="shipping_carrier">Shipping carrier</label>
            <input id="shipping_carrier" value={form.shipping_carrier} onChange={set('shipping_carrier')} />
          </div>
        </div>

        <div className="section-heading">Commercial terms</div>
        <div className="field-row">
          <div className="field-group">
            <label>Commission</label>
            <div className="status-text">40% — fixed platform-wide, not editable</div>
          </div>
          <div className="field-group">
            <label htmlFor="payout_frequency">Payout frequency</label>
            <select id="payout_frequency" value={form.payout_frequency} onChange={set('payout_frequency')}>
              {PAYOUT_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-heading">Payout / bank details</div>
        <div className="field-group">
          <label htmlFor="account_holder_name">Account holder name</label>
          <input
            id="account_holder_name"
            value={form.account_holder_name}
            onChange={set('account_holder_name')}
          />
        </div>
        {form.country === 'US' ? (
          <div className="field-row">
            <div className="field-group">
              <label htmlFor="routing_number">Routing number</label>
              <input id="routing_number" value={form.routing_number} onChange={set('routing_number')} />
            </div>
            <div className="field-group">
              <label htmlFor="account_number">Account number</label>
              <input id="account_number" value={form.account_number} onChange={set('account_number')} />
            </div>
          </div>
        ) : (
          <div className="field-group">
            <label htmlFor="iban">IBAN</label>
            <input id="iban" value={form.iban} onChange={set('iban')} />
          </div>
        )}
        <div className="field-group">
          <label htmlFor="bank_name">Bank name</label>
          <input id="bank_name" value={form.bank_name} onChange={set('bank_name')} />
        </div>

        <div className="section-heading">Internal notes</div>
        <div className="field-group">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" rows={4} value={form.notes} onChange={set('notes')} />
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="field-row" style={{ alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn btn-gold" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {savedAt && <span className="status-text">Saved</span>}
        </div>
      </form>

      <div className="form-card">
        <div className="section-heading">Onboarding</div>

        {brand.onboarding_token ? (
          <>
            <div className="field-group">
              <label htmlFor="onboardLink">Wizard link</label>
              <input
                id="onboardLink"
                readOnly
                value={typeof window !== 'undefined' ? `${window.location.origin}/onboard/${brand.onboarding_token}` : ''}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="field-row" style={{ alignItems: 'center', gap: 12 }}>
              <button type="button" className="btn" onClick={copyOnboardLink}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button type="button" className="btn" onClick={handleRegenerate} disabled={regenerating}>
                {regenerating ? 'Regenerating…' : 'Regenerate link'}
              </button>
              <span className="status-text">Step {brand.current_step ?? 1} of 10</span>
            </div>
          </>
        ) : (
          <div className="field-row" style={{ alignItems: 'center', gap: 12 }}>
            <div className="status-text">
              This brand predates the onboarding wizard and has no link yet.
            </div>
            <button type="button" className="btn btn-gold" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? 'Generating…' : 'Generate link'}
            </button>
          </div>
        )}

        <div className="section-heading">Contract</div>
        {brand.contract_status ? (
          <div className="status-text">
            {brand.contract_status === 'signed' && (
              <>
                Signed by {brand.contract_signed_by_name} on{' '}
                {new Date(brand.contract_signed_at).toLocaleDateString()}
                {brand.contract_pdf_url && (
                  <>
                    {' · '}
                    <a href={brand.contract_pdf_url} target="_blank" rel="noreferrer">
                      View PDF
                    </a>
                  </>
                )}
              </>
            )}
            {brand.contract_status === 'voided' && 'Voided — awaiting a new contract'}
            {brand.contract_status === 'pending' && 'Generated, not yet signed'}
          </div>
        ) : (
          <div className="status-text">No contract generated yet</div>
        )}

        <div className="section-heading">Platform connection</div>
        <div className="status-text">
          {brand.platform_status
            ? `${brand.platform_shop_domain} · ${brand.platform_status}`
            : 'Not connected'}
        </div>

        <div className="section-heading">Catalogue sync (pull from brand's store)</div>
        <div className="field-row" style={{ alignItems: 'center', gap: 12 }}>
          <div className="status-text">
            {brand.sync_status
              ? `${brand.sync_status}${brand.sync_completed_at ? ' · ' + new Date(brand.sync_completed_at).toLocaleString() : ''}${
                  brand.sync_status === 'completed'
                    ? ` · ${brand.sync_products_created} created, ${brand.sync_products_updated} updated`
                    : ''
                }`
              : 'No sync yet'}
          </div>
          {brand.platform_status === 'active' && (
            <button type="button" className="btn" onClick={handleSyncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
          {brand.sync_status && (
            <button type="button" className="btn" onClick={handleDeleteProducts} disabled={deletingProducts}>
              {deletingProducts ? 'Clearing…' : 'Clear synced products'}
            </button>
          )}
        </div>
        {syncError && <div className="login-error">{syncError}</div>}
        {deleteProductsMessage && <div className="status-text">{deleteProductsMessage}</div>}

        <div className="section-heading">Import into la-diesse.myshopify.com (draft products)</div>
        <div className="field-row" style={{ alignItems: 'center', gap: 12 }}>
          <div className="status-text">
            {brand.import_status
              ? `${brand.import_status}${brand.import_completed_at ? ' · ' + new Date(brand.import_completed_at).toLocaleString() : ''}${
                  brand.import_status === 'completed'
                    ? ` · ${brand.import_products_created} created, ${brand.import_products_updated} updated`
                    : ''
                }`
              : 'No import yet'}
          </div>
          {brand.import_status && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteShopifyProducts}
              disabled={deletingShopifyProducts}
            >
              {deletingShopifyProducts ? 'Deleting…' : 'Delete from Shopify'}
            </button>
          )}
        </div>
        {brand.import_status === 'failed' && brand.import_error_message && (
          <div className="login-error">{brand.import_error_message}</div>
        )}
        {deleteShopifyProductsMessage && <div className="status-text">{deleteShopifyProductsMessage}</div>}
      </div>

      <div className="form-card">
        <div className="section-heading">Danger zone</div>
        <div className="field-row" style={{ alignItems: 'center', gap: 12 }}>
          <div className="status-text">Permanently delete this brand and all of its onboarding data.</div>
          <button type="button" className="btn btn-danger" onClick={handleDeleteBrand} disabled={deletingBrand}>
            {deletingBrand ? 'Deleting…' : 'Delete brand'}
          </button>
        </div>
      </div>
    </div>
  );
}
