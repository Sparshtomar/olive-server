import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadEnv } from '../config/env';
import { createDb } from './client';

// Resolved from the package root (npm scripts run there) so it works from src/ and the bundled dist/.
const migrationsFolder = resolve(process.cwd(), 'drizzle');

export const runMigrations = async (url: string) => {
  const { db, close } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
};

// Run directly: `npm run db:migrate`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = loadEnv();
  await runMigrations(env.DATABASE_URL);
  console.log('Migrations applied');
}
