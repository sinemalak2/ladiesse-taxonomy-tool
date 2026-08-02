import { NextResponse } from 'next/server';
import { getPool, query } from '../../../../lib/db.js';
import { COUNTRY_OPTIONS } from '../../../../lib/brandValidation.js';
import { deleteLadiesseImportedProducts } from '../../../../lib/brandProductImport.js';

const ONBOARDING_STATUSES = [
  'pending',
  'under_review',
  'terms_set',
  'contract_generated',
  'contract_signed',
  'platform_connected',
  'syncing_products',
  'active',
  'paused',
  'suspended',
  'offboarded',
];

const PAYOUT_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];

// Plain-text columns on brands that the edit page is allowed to write,
// grouped the same way the schema comments group them (legal/ops/etc).
// Keeping this as a whitelist (rather than spreading req body into the
// UPDATE) means a stray field in the request body can't reach the query.
const EDITABLE_BRAND_FIELDS = [
  'country',
  'legal_company_name',
  'legal_address',
  'tax_id',
  'tax_office',
  'trade_registry_no',
  'warehouse_address',
  'shipping_carrier',
  'payout_frequency',
  'notes',
];

export async function GET(request, { params }) {
  const { id } = await params;

  const { rows } = await query(
    `SELECT
       b.*,
       c.full_name AS contact_name, c.email AS contact_email, c.phone_number AS contact_phone,
       ba.account_holder_name, ba.iban, ba.routing_number, ba.account_number, ba.bank_name,
       ct.id AS contract_id, ct.status AS contract_status, ct.signed_at AS contract_signed_at,
       ct.signed_by_name AS contract_signed_by_name, ct.pdf_url AS contract_pdf_url,
       pc.status AS platform_status, pc.shop_domain AS platform_shop_domain,
       sj.status AS sync_status, sj.products_created AS sync_products_created,
       sj.products_updated AS sync_products_updated, sj.completed_at AS sync_completed_at,
       ij.status AS import_status, ij.products_created AS import_products_created,
       ij.products_updated AS import_products_updated, ij.error_message AS import_error_message,
       ij.completed_at AS import_completed_at
     FROM brands b
     LEFT JOIN LATERAL (
       SELECT full_name, email, phone_number
       FROM brand_contacts
       WHERE brand_id = b.id
       ORDER BY is_primary DESC, created_at ASC
       LIMIT 1
     ) c ON true
     LEFT JOIN LATERAL (
       SELECT account_holder_name, iban, routing_number, account_number, bank_name
       FROM brand_bank_accounts
       WHERE brand_id = b.id AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1
     ) ba ON true
     LEFT JOIN LATERAL (
       SELECT id, status, signed_at, signed_by_name, pdf_url
       FROM brand_contracts
       WHERE brand_id = b.id
       ORDER BY created_at DESC
       LIMIT 1
     ) ct ON true
     LEFT JOIN LATERAL (
       SELECT status, shop_domain
       FROM brand_platform_connections
       WHERE brand_id = b.id AND platform = 'shopify'
       LIMIT 1
     ) pc ON true
     LEFT JOIN LATERAL (
       SELECT status, products_created, products_updated, completed_at
       FROM product_sync_jobs
       WHERE brand_id = b.id
       ORDER BY created_at DESC
       LIMIT 1
     ) sj ON true
     LEFT JOIN LATERAL (
       SELECT status, products_created, products_updated, error_message, completed_at
       FROM product_import_jobs
       WHERE brand_id = b.id
       ORDER BY created_at DESC
       LIMIT 1
     ) ij ON true
     WHERE b.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  // shopify_access_token_ref is a pointer into the secrets store, not
  // something the edit UI should ever display or round-trip.
  const { shopify_access_token_ref, ...brand } = rows[0];
  return NextResponse.json({ brand });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();

  if (body.onboarding_status !== undefined && !ONBOARDING_STATUSES.includes(body.onboarding_status)) {
    return NextResponse.json({ error: 'Invalid onboarding_status' }, { status: 400 });
  }
  if (body.payout_frequency !== undefined && !PAYOUT_FREQUENCIES.includes(body.payout_frequency)) {
    return NextResponse.json({ error: 'Invalid payout_frequency' }, { status: 400 });
  }
  if (body.country !== undefined && !COUNTRY_OPTIONS.includes(body.country)) {
    return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
  }
  if (
    body.avg_processing_days !== undefined &&
    body.avg_processing_days !== null &&
    Number.isNaN(Number(body.avg_processing_days))
  ) {
    return NextResponse.json({ error: 'Invalid avg_processing_days' }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const setClauses = ['updated_at = now()'];
    const values = [];

    if (body.onboarding_status !== undefined) {
      values.push(body.onboarding_status);
      setClauses.push(`onboarding_status = $${values.length}`);
      // live_at is set the first time a brand reaches 'active' and never
      // cleared afterward, so it stays a record of when the catalogue
      // first went live even if the brand later pauses/offboards.
      setClauses.push(
        `live_at = CASE WHEN $${values.length} = 'active' AND live_at IS NULL THEN now() ELSE live_at END`
      );
    }

    // commission_percentage is intentionally not writable here — it's fixed
    // platform-wide at 40% (enforced by a DB CHECK constraint), not a
    // per-brand negotiated term.

    if (body.avg_processing_days !== undefined) {
      values.push(body.avg_processing_days);
      setClauses.push(`avg_processing_days = $${values.length}`);
    }

    for (const field of EDITABLE_BRAND_FIELDS) {
      if (body[field] === undefined) continue;
      const v = typeof body[field] === 'string' ? body[field].trim() || null : body[field];
      values.push(v);
      setClauses.push(`${field} = $${values.length}`);
    }

    let brand;
    if (values.length > 0) {
      values.push(id);
      const { rows } = await client.query(
        `UPDATE brands SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING id, brand_name, onboarding_status`,
        values
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
      }
      brand = rows[0];
    } else {
      const { rows } = await client.query(
        'SELECT id, brand_name, onboarding_status FROM brands WHERE id = $1',
        [id]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
      }
      brand = rows[0];
    }

    // Bank details live in their own table (kept off the wide brands row
    // for auditability — see schema comment). Upsert the single active
    // account rather than always inserting a new row. The admin form always
    // submits the full bank field set, so this overwrites rather than
    // COALESCEs iban/routing_number/account_number — otherwise switching a
    // brand's country would leave a stale IBAN sitting next to a routing
    // number instead of clearing it.
    if (
      body.account_holder_name !== undefined ||
      body.iban !== undefined ||
      body.routing_number !== undefined ||
      body.account_number !== undefined ||
      body.bank_name !== undefined
    ) {
      const accountHolderName = body.account_holder_name || null;
      const iban = body.iban || null;
      const routingNumber = body.routing_number || null;
      const accountNumber = body.account_number || null;
      const bankName = body.bank_name || null;

      const { rows: existing } = await client.query(
        'SELECT id FROM brand_bank_accounts WHERE brand_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
        [id]
      );

      if (existing.length > 0) {
        await client.query(
          `UPDATE brand_bank_accounts
           SET account_holder_name = COALESCE($1, account_holder_name),
               iban = $2, routing_number = $3, account_number = $4,
               bank_name = COALESCE($5, bank_name)
           WHERE id = $6`,
          [accountHolderName, iban, routingNumber, accountNumber, bankName, existing[0].id]
        );
      } else if (accountHolderName && (iban || (routingNumber && accountNumber))) {
        await client.query(
          `INSERT INTO brand_bank_accounts
             (brand_id, account_holder_name, iban, routing_number, account_number, bank_name)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, accountHolderName, iban, routingNumber, accountNumber, bankName]
        );
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ brand });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;

  // Best-effort: clean up any drafts this brand pushed into
  // la-diesse.myshopify.com before the DB row (and its FK-cascaded
  // brand_products, which carry the only record of those products' GIDs)
  // disappears. A failure here shouldn't block the actual deletion the
  // staff member asked for — surfaced in the response either way.
  let productCleanup = null;
  try {
    productCleanup = await deleteLadiesseImportedProducts({ brandId: id });
  } catch (err) {
    productCleanup = { error: err.message };
  }

  const { rows } = await query('DELETE FROM brands WHERE id = $1 RETURNING id', [id]);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, productCleanup });
}
