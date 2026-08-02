import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';

// Staff-only (protected by the existing session middleware). Lets the
// admin page show whether App B's self-connection to la-diesse.myshopify.com
// (see app/api/admin/ladiesse-shopify/install/route.js) is set up yet.
export async function GET() {
  const { rows } = await query(
    `SELECT shop_domain, status, connected_at FROM ladiesse_shopify_connection
     ORDER BY connected_at DESC LIMIT 1`
  );
  return NextResponse.json({ connection: rows[0] || null });
}
