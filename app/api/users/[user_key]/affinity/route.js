import { NextResponse } from 'next/server';
import { query } from '../../../../../lib/db.js';
import { COLD_START_MIN_EVENTS } from '../../../../../lib/affinity-config.js';

// GET /api/users/:user_key/affinity -> [{ category_key, attribute_value, score }, ...]
// Called by ladiesse-ai-search at query time, server-to-server (see
// middleware.js for the bearer-secret exemption from the login gate). Cold
// start: below COLD_START_MIN_EVENTS total events, return [] so the caller
// falls back to pure semantic match rather than ranking on a noisy vector.
export async function GET(request, { params }) {
  const secret = process.env.AFFINITY_API_SECRET;
  const authHeader = request.headers.get('authorization');

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { user_key } = await params;

  const { rows: countRows } = await query(
    'SELECT count(*)::int AS count FROM user_events WHERE user_key = $1',
    [user_key]
  );

  if (countRows[0].count < COLD_START_MIN_EVENTS) {
    return NextResponse.json([]);
  }

  const { rows } = await query(
    `SELECT category_key, attribute_value, score
     FROM user_attribute_affinity
     WHERE user_key = $1
     ORDER BY category_key, score DESC`,
    [user_key]
  );

  return NextResponse.json(rows);
}
