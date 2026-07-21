import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf8');
  const pool = getPool();
  await pool.query(schema);
  const { rows } = await pool.query('SELECT key FROM tag_categories ORDER BY key');
  console.log('Migration complete. tag_categories:', rows.map((r) => r.key).join(', '));
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
