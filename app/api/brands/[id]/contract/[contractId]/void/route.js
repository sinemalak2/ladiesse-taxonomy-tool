import { NextResponse } from 'next/server';
import { getPool } from '../../../../../../../lib/db.js';

// Staff-only (protected by the existing session middleware). Voiding never
// deletes or edits the signed row (audit trail) — it just marks it voided
// and reopens the contract step so the brand can sign a fresh one.
export async function POST(request, { params }) {
  const { id, contractId } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = (body.reason || '').trim();

  if (!reason) {
    return NextResponse.json({ error: 'A reason is required to void a contract' }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE brand_contracts SET status = 'voided', voided_at = now(), voided_reason = $1
       WHERE id = $2 AND brand_id = $3 AND status = 'signed'
       RETURNING id`,
      [reason, contractId, id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Signed contract not found' }, { status: 404 });
    }

    await client.query(
      `UPDATE brands SET onboarding_status = 'terms_set', updated_at = now() WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
