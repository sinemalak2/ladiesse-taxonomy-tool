import { NextResponse } from 'next/server';
import { getPool, query } from '../../../../../../lib/db.js';
import { BRAND_SESSION_COOKIE_NAME, verifyBrandSessionToken } from '../../../../../../lib/brandAuth.js';
import { STEP_SCHEMAS } from '../../../../../../lib/brandValidation.js';
import { generateContractHtml } from '../../../../../../lib/contractTemplate.js';

async function getBrandSession(request) {
  const token = request.cookies.get(BRAND_SESSION_COOKIE_NAME)?.value;
  return verifyBrandSessionToken(token);
}

function parseStep(stepParam) {
  const step = Number(stepParam);
  if (!Number.isInteger(step) || step < 1 || step > 10) return null;
  return step;
}

export async function GET(request, { params }) {
  const { step: stepParam } = await params;
  const step = parseStep(stepParam);
  if (step === null) return NextResponse.json({ error: 'Invalid step' }, { status: 400 });

  const session = await getBrandSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { brandId } = session;

  const { rows: brandRows } = await query(
    `SELECT brand_name, category, website_url, instagram_handle,
            legal_company_name, legal_address, tax_id, tax_office, trade_registry_no,
            warehouse_address, avg_processing_days, shipping_carrier,
            commission_percentage, payout_frequency,
            current_step, onboarding_status
     FROM brands WHERE id = $1`,
    [brandId]
  );
  if (brandRows.length === 0) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  const brand = brandRows[0];

  const base = { currentStep: brand.current_step, onboardingStatus: brand.onboarding_status };

  switch (step) {
    case 1:
      return NextResponse.json({ ...base, data: {} });

    case 2:
      return NextResponse.json({
        ...base,
        data: {
          brand_name: brand.brand_name || '',
          category: brand.category || '',
          website_url: brand.website_url || '',
          instagram_handle: brand.instagram_handle || '',
        },
      });

    case 3: {
      const { rows } = await query(
        `SELECT full_name, phone_number, email, role FROM brand_contacts
         WHERE brand_id = $1 ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
        [brandId]
      );
      const c = rows[0] || {};
      return NextResponse.json({
        ...base,
        data: {
          full_name: c.full_name || '',
          phone_number: c.phone_number || '',
          email: c.email || '',
          role: c.role || 'primary',
        },
      });
    }

    case 4:
      return NextResponse.json({
        ...base,
        data: {
          legal_company_name: brand.legal_company_name || '',
          legal_address: brand.legal_address || '',
          tax_id: brand.tax_id || '',
          tax_office: brand.tax_office || '',
          trade_registry_no: brand.trade_registry_no || '',
        },
      });

    case 5:
      return NextResponse.json({
        ...base,
        data: {
          warehouse_address: brand.warehouse_address || '',
          avg_processing_days: brand.avg_processing_days ?? 2,
          shipping_carrier: brand.shipping_carrier || '',
        },
      });

    case 6: {
      const { rows } = await query(
        `SELECT account_holder_name, iban, bank_name FROM brand_bank_accounts
         WHERE brand_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
        [brandId]
      );
      const b = rows[0] || {};
      return NextResponse.json({
        ...base,
        data: {
          account_holder_name: b.account_holder_name || '',
          iban: b.iban || '',
          bank_name: b.bank_name || '',
        },
      });
    }

    case 7: {
      if (brand.onboarding_status !== 'terms_set' && brand.onboarding_status !== 'contract_signed') {
        return NextResponse.json({
          ...base,
          gated: true,
          message: "Thanks for submitting your information. Ladiesse is reviewing it and will let you know when your contract is ready — please check back then.",
        });
      }

      // Already signed — show the exact signed snapshot, not a fresh render,
      // so a brand revisiting this step sees what they actually agreed to.
      if (brand.onboarding_status === 'contract_signed') {
        const { rows: signedRows } = await query(
          `SELECT contract_html, signed_by_name, signed_at FROM brand_contracts
           WHERE brand_id = $1 AND status = 'signed' ORDER BY created_at DESC LIMIT 1`,
          [brandId]
        );
        const signed = signedRows[0];
        return NextResponse.json({
          ...base,
          gated: false,
          alreadySigned: true,
          contractHtml: signed?.contract_html || '',
          signedByName: signed?.signed_by_name,
          signedAt: signed?.signed_at,
        });
      }

      const { rows: contactRows } = await query(
        `SELECT full_name FROM brand_contacts WHERE brand_id = $1
         ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
        [brandId]
      );
      const contractHtml = generateContractHtml(
        { ...brand, rep_full_name: contactRows[0]?.full_name },
        new Date()
      );
      return NextResponse.json({
        ...base,
        gated: false,
        alreadySigned: false,
        contractHtml,
        commercialTerms: {
          commission_percentage: brand.commission_percentage,
          payout_frequency: brand.payout_frequency,
        },
      });
    }

    case 8:
    case 9:
      return NextResponse.json({ ...base, comingSoon: true });

    case 10:
      return NextResponse.json({ ...base, data: {} });

    default:
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
  }
}

export async function PATCH(request, { params }) {
  const { step: stepParam } = await params;
  const step = parseStep(stepParam);
  if (step === null) return NextResponse.json({ error: 'Invalid step' }, { status: 400 });

  const session = await getBrandSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { brandId } = session;

  const { rows: brandRows } = await query(
    'SELECT current_step, onboarding_status FROM brands WHERE id = $1',
    [brandId]
  );
  if (brandRows.length === 0) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  const currentBrand = brandRows[0];

  // Server-side gate — never trust the UI's own navigation to enforce this.
  // Re-saving the current or an earlier (already-completed) step is fine;
  // jumping ahead of where the brand has actually gotten to is not.
  if (step > currentBrand.current_step) {
    return NextResponse.json({ error: 'Cannot skip ahead of your current step' }, { status: 403 });
  }

  if (step === 7 && currentBrand.onboarding_status !== 'terms_set') {
    return NextResponse.json({ error: 'Your contract is not ready yet' }, { status: 403 });
  }

  if (step === 8 || step === 9 || step === 10) {
    return NextResponse.json({ error: 'This step is not available yet' }, { status: 501 });
  }

  const schema = STEP_SCHEMAS[step];
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const data = parsed.data;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let newStep = step + 1;

    switch (step) {
      case 1:
        await client.query('UPDATE brands SET current_step = GREATEST(current_step, $1), updated_at = now() WHERE id = $2', [
          newStep,
          brandId,
        ]);
        break;

      case 2:
        await client.query(
          `UPDATE brands SET brand_name = $1, category = $2, website_url = $3, instagram_handle = $4,
             current_step = GREATEST(current_step, $5), updated_at = now()
           WHERE id = $6`,
          [data.brand_name, data.category, data.website_url || null, data.instagram_handle || null, newStep, brandId]
        );
        break;

      case 3: {
        const { rows: existing } = await client.query(
          `SELECT id FROM brand_contacts WHERE brand_id = $1 ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
          [brandId]
        );
        if (existing.length > 0) {
          await client.query(
            `UPDATE brand_contacts SET full_name = $1, phone_number = $2, email = $3, role = $4 WHERE id = $5`,
            [data.full_name, data.phone_number, data.email, data.role, existing[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO brand_contacts (brand_id, full_name, phone_number, email, role, is_primary)
             VALUES ($1, $2, $3, $4, $5, true)`,
            [brandId, data.full_name, data.phone_number, data.email, data.role]
          );
        }
        await client.query('UPDATE brands SET current_step = GREATEST(current_step, $1), updated_at = now() WHERE id = $2', [
          newStep,
          brandId,
        ]);
        break;
      }

      case 4:
        await client.query(
          `UPDATE brands SET legal_company_name = $1, legal_address = $2, tax_id = $3, tax_office = $4,
             trade_registry_no = $5,
             onboarding_status = CASE WHEN onboarding_status = 'pending' THEN 'under_review' ELSE onboarding_status END,
             current_step = GREATEST(current_step, $6), updated_at = now()
           WHERE id = $7`,
          [
            data.legal_company_name,
            data.legal_address,
            data.tax_id,
            data.tax_office,
            data.trade_registry_no || null,
            newStep,
            brandId,
          ]
        );
        break;

      case 5:
        await client.query(
          `UPDATE brands SET warehouse_address = $1, avg_processing_days = $2, shipping_carrier = $3,
             current_step = GREATEST(current_step, $4), updated_at = now()
           WHERE id = $5`,
          [data.warehouse_address, data.avg_processing_days, data.shipping_carrier, newStep, brandId]
        );
        break;

      case 6: {
        const { rows: existing } = await client.query(
          `SELECT id FROM brand_bank_accounts WHERE brand_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
          [brandId]
        );
        if (existing.length > 0) {
          await client.query(
            `UPDATE brand_bank_accounts SET account_holder_name = $1, iban = $2, bank_name = $3 WHERE id = $4`,
            [data.account_holder_name, data.iban, data.bank_name, existing[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO brand_bank_accounts (brand_id, account_holder_name, iban, bank_name)
             VALUES ($1, $2, $3, $4)`,
            [brandId, data.account_holder_name, data.iban, data.bank_name]
          );
        }
        await client.query('UPDATE brands SET current_step = GREATEST(current_step, $1), updated_at = now() WHERE id = $2', [
          newStep,
          brandId,
        ]);
        break;
      }

      case 7: {
        const { rows: brandFull } = await client.query(
          `SELECT legal_company_name, legal_address, tax_id, commission_percentage, payout_frequency
           FROM brands WHERE id = $1`,
          [brandId]
        );
        const { rows: contactRows } = await client.query(
          `SELECT full_name FROM brand_contacts WHERE brand_id = $1
           ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
          [brandId]
        );
        // Regenerated from the same inputs the brand was just shown in GET —
        // this is what gets snapshotted as the signed record.
        const contractHtml = generateContractHtml(
          { ...brandFull[0], rep_full_name: contactRows[0]?.full_name },
          new Date()
        );

        const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
        const userAgent = request.headers.get('user-agent') || 'unknown';

        await client.query(
          `INSERT INTO brand_contracts
             (brand_id, contract_html, status, signed_at, signed_by_name, signed_ip, signed_user_agent)
           VALUES ($1, $2, 'signed', now(), $3, $4, $5)`,
          [brandId, contractHtml, data.signed_by_name, ip, userAgent]
        );

        await client.query(
          `UPDATE brands SET onboarding_status = 'contract_signed',
             current_step = GREATEST(current_step, $1), updated_at = now()
           WHERE id = $2`,
          [newStep, brandId]
        );
        break;
      }

      default:
        await client.query('ROLLBACK');
        client.release();
        return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
    }

    await client.query('COMMIT');
    return NextResponse.json({ ok: true, currentStep: newStep });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
