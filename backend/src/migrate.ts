import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createPgDb } from './db';

// Applies schema.sql. Every statement is idempotent and non-destructive.
async function main() {
  const db = createPgDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  try {
    await db.pool.query(sql);
    console.log('Schema is up to date.');
  } finally {
    await db.pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
