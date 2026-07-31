'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const PAYOUT_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];

const EDITABLE_FIELDS = [
  'legal_company_name',
  'legal_address',
  'tax_id',
  'tax_office',
  'trade_registry_no',
  'warehouse_address',
  'avg_processing_days',
  'shipping_carrier',
  'commission_percentage',
  'payout_frequency',
  'contract_signed_date',
  'contract_url',
  'notes',
  'account_holder_name',
  'iban',
  'bank_name',
];

function toFormValue(brand) {
  const form = {};
  for (const field of EDITABLE_FIELDS) {
    const v = brand[field];
    if (field === 'contract_signed_date' && v) {
      form[field] = v.slice(0, 10); // ISO date -> yyyy-mm-dd for <input type="date">
    } else {
      form[field] = v ?? '';
    }
  }
  return form;
}

export default function BrandDetailPage() {
  const { id } = useParams();
  const [brand, setBrand] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

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

      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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
        <div className="field-group">
          <label htmlFor="legal_company_name">Legal company name</label>
          <input
            id="legal_company_name"
            value={form.legal_company_name}
            onChange={set('legal_company_name')}
          />
        </div>
        <div className="field-group">
          <label htmlFor="legal_address">Legal address</label>
          <input id="legal_address" value={form.legal_address} onChange={set('legal_address')} />
        </div>
        <div className="field-row">
          <div className="field-group">
            <label htmlFor="tax_id">Tax ID (VKN)</label>
            <input id="tax_id" value={form.tax_id} onChange={set('tax_id')} />
          </div>
          <div className="field-group">
            <label htmlFor="tax_office">Tax office</label>
            <input id="tax_office" value={form.tax_office} onChange={set('tax_office')} />
          </div>
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
            <label htmlFor="commission_percentage">Commission %</label>
            <input
              id="commission_percentage"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.commission_percentage}
              onChange={set('commission_percentage')}
            />
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
        <div className="field-row">
          <div className="field-group">
            <label htmlFor="contract_signed_date">Contract signed date</label>
            <input
              id="contract_signed_date"
              type="date"
              value={form.contract_signed_date}
              onChange={set('contract_signed_date')}
            />
          </div>
          <div className="field-group">
            <label htmlFor="contract_url">Contract URL</label>
            <input
              id="contract_url"
              type="url"
              placeholder="https://"
              value={form.contract_url}
              onChange={set('contract_url')}
            />
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
        <div className="field-row">
          <div className="field-group">
            <label htmlFor="iban">IBAN</label>
            <input id="iban" value={form.iban} onChange={set('iban')} />
          </div>
          <div className="field-group">
            <label htmlFor="bank_name">Bank name</label>
            <input id="bank_name" value={form.bank_name} onChange={set('bank_name')} />
          </div>
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
    </div>
  );
}
