import { Pool } from 'pg';

export type QueryResult<T> = { rows: T[]; rowCount: number };

// Minimal database interface so the app can run against pg (Neon) normally
// and an in-process Postgres (PGlite) in tests.
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export function createPgDb(connectionString = process.env.DATABASE_URL): Db & { pool: Pool } {
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing. Check the root .env.local file.');
  }

  const pool = new Pool({
    connectionString,
    // Neon requires TLS. Set DATABASE_SSL=false for a local Postgres without TLS.
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (error) => {
    console.error('[db] idle client error:', error.message);
  });

  return {
    pool,
    async query<T>(text: string, params: unknown[] = []) {
      const result = await pool.query(text, params);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
  };
}
