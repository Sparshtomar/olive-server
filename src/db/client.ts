import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const createDb = (url: string) => {
  const sql = postgres(url, {
    max: 10,
    // Neon and other managed Postgres require TLS; local dev doesn't.
    ssl: /sslmode=require|neon\.tech/.test(url) ? 'require' : undefined,
    onnotice: () => {},
  });
  return { db: drizzle(sql, { schema, casing: 'snake_case' }), close: () => sql.end({ timeout: 5 }) };
};

export type Database = ReturnType<typeof createDb>['db'];
/** A transaction handle has the same query API, so repositories accept either. */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
