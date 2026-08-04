import { NextResponse } from 'next/server';
import { getPool, query } from '../../../../../../lib/db.js';
import { BRAND_SESSION_COOKIE_NAME, verifyBrandSessionToken } from '../../../../../../lib/brandAuth.js';
import { STEP_SCHEMAS, makeStep4Schema, makeStep6Schema } from '../../../../../../lib/brandValidation.js';
import { generateContractHtml } from '../../../../../../lib/contractTemplate.js';
import { decryptToken } from '../../../../../../lib/brandTokenEncryption.js';
import { syncBrandProducts } from '../../../../../../lib/brandSync.js';
import { importBrandProductsToLadiesse } from '../../../../../../lib/brandProductImport.js';

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
    `SELECT brand_name, category, country, website_url, instagram_handle,
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
          country: brand.country || 'TR',
          website_url: brand.website_url || '',
          instagram_handle: brand.instagram_handle || '',
        },
      });

    case 3: {
      const { rows } = await query(
        `SELECT full_name, title, phone_number, email, role FROM brand_contacts
         WHERE brand_id = $1 ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
        [brandId]
      );
      const c = rows[0] || {};
      return NextResponse.json({
        ...base,
        data: {
          full_name: c.full_name || '',
          title: c.title || '',
          phone_number: c.phone_number || '',
          email: c.email || '',
          role: c.role || 'primary',
        },
      });
    }

    case 4:
      return NextResponse.json({
        ...base,
        country: brand.country || 'TR',
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
        `SELECT account_holder_name, iban, routing_number, account_number, bank_name
         FROM brand_bank_accounts WHERE brand_id = $1 AND is_active = true
         ORDER BY created_at DESC LIMIT 1`,
        [brandId]
      );
      const b = rows[0] || {};
      return NextResponse.json({
        ...base,
        country: brand.country || 'TR',
        data: {
          account_holder_name: b.account_holder_name || '',
          iban: b.iban || '',
          routing_number: b.routing_number || '',
          account_number: b.account_number || '',
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
        `SELECT full_name, title FROM brand_contacts WHERE brand_id = $1
         ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
        [brandId]
      );
      const contractHtml = generateContractHtml(
        { ...brand, rep_full_name: contactRows[0]?.full_name, rep_title: contactRows[0]?.title },
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

    case 8: {
      const { rows: connRows } = await query(
        `SELECT shop_domain, status FROM brand_platform_connections
         WHERE brand_id = $1 AND platform = 'shopify' LIMIT 1`,
        [brandId]
      );
      return NextResponse.json({ ...base, connection: connRows[0] || null });
    }

    case 9: {
      const { rows: jobRows } = await query(
        `SELECT id, status, platform_connection_id, products_created, products_updated, error_message, completed_at
         FROM product_sync_jobs WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [brandId]
      );
      let job = jobRows[0] || null;

      // Kick off the actual sync the first time this step is loaded after
      // the job was created 'pending' by the OAuth callback — deliberately
      // not run from the callback itself (see that route's comment) since a
      // full catalogue sync can outlast a redirect. This request blocks
      // until the sync finishes; the wizard's poll interval just re-fetches
      // this same GET, so it naturally shows 'completed' once this returns.
      if (job && job.status === 'pending') {
        const { rows: connRows } = await query(
          'SELECT shop_domain, access_token_ref FROM brand_platform_connections WHERE id = $1',
          [job.platform_connection_id]
        );
        const connection = connRows[0];
        if (connection) {
          try {
            const summary = await syncBrandProducts({
              brandId,
              platformConnectionId: job.platform_connection_id,
              accessToken: decryptToken(connection.access_token_ref),
              shopDomain: connection.shop_domain,
              jobId: job.id,
            });
            job = { ...job, status: 'completed', products_created: summary.created, products_updated: summary.updated };

            // Pushing the pulled catalogue into la-diesse.myshopify.com is
            // purely an internal Ladiesse operation the brand never sees or
            // needs to act on — awaited (serverless functions can be frozen
            // right after a response is sent, so this can't be a true
            // fire-and-forget) but failures here (e.g. a missing Shopify
            // scope on our own store's app) are swallowed from the brand's
            // response and only surfaced to staff via the admin page.
            try {
              await importBrandProductsToLadiesse({ brandId });
            } catch (err) {
              console.error('Import to la-diesse.myshopify.com failed:', err);
            }
          } catch (err) {
            job = { ...job, status: 'failed', error_message: err.message };
          }
        }
      }

      return NextResponse.json({ ...base, job });
    }

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
    'SELECT current_step, onboarding_status, country FROM brands WHERE id = $1',
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

  // Steps 4 and 6 validate differently depending on the brand's country
  // (VKN/TCKN vs EIN, IBAN vs routing/account) — everything else uses a
  // fixed schema.
  const schema =
    step === 4 ? makeStep4Schema(currentBrand.country)
    : step === 6 ? makeStep6Schema(currentBrand.country)
    : STEP_SCHEMAS[step];
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
          `UPDATE brands SET brand_name = $1, category = $2, country = $3, website_url = $4, instagram_handle = $5,
             current_step = GREATEST(current_step, $6), updated_at = now()
           WHERE id = $7`,
          [
            data.brand_name,
            data.category,
            data.country,
            data.website_url || null,
            data.instagram_handle || null,
            newStep,
            brandId,
          ]
        );
        break;

      case 3: {
        const { rows: existing } = await client.query(
          `SELECT id FROM brand_contacts WHERE brand_id = $1 ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
          [brandId]
        );
        if (existing.length > 0) {
          await client.query(
            `UPDATE brand_contacts SET full_name = $1, title = $2, phone_number = $3, email = $4, role = $5 WHERE id = $6`,
            [data.full_name, data.title, data.phone_number, data.email, data.role, existing[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO brand_contacts (brand_id, full_name, title, phone_number, email, role, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6, true)`,
            [brandId, data.full_name, data.title, data.phone_number, data.email, data.role]
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
            data.tax_office || null,
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
        // Whichever fields this country's schema didn't produce are
        // explicitly nulled out, so switching a brand's country later
        // doesn't leave a stale IBAN sitting alongside a routing number.
        const iban = data.iban ?? null;
        const routingNumber = data.routing_number ?? null;
        const accountNumber = data.account_number ?? null;

        const { rows: existing } = await client.query(
          `SELECT id FROM brand_bank_accounts WHERE brand_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
          [brandId]
        );
        if (existing.length > 0) {
          await client.query(
            `UPDATE brand_bank_accounts
             SET account_holder_name = $1, iban = $2, routing_number = $3, account_number = $4, bank_name = $5
             WHERE id = $6`,
            [data.account_holder_name, iban, routingNumber, accountNumber, data.bank_name, existing[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO brand_bank_accounts
               (brand_id, account_holder_name, iban, routing_number, account_number, bank_name)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [brandId, data.account_holder_name, iban, routingNumber, accountNumber, data.bank_name]
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
          `SELECT full_name, title FROM brand_contacts WHERE brand_id = $1
           ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
          [brandId]
        );
        // Regenerated from the same inputs the brand was just shown in GET —
        // this is what gets snapshotted as the signed record.
        const contractHtml = generateContractHtml(
          { ...brandFull[0], rep_full_name: contactRows[0]?.full_name, rep_title: contactRows[0]?.title },
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
