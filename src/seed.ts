import pino from 'pino';
import { createAiServices } from './ai';
import { loadEnv } from './config/env';
import { createContainer } from './container';
import { createDb } from './db/client';
import { runMigrations } from './db/migrate';
import type { DemoClock } from './modules/demo';

/**
 * Seeds the database at DATABASE_URL with the same demo user the app's "Explore
 * with demo data" button creates: two weeks of meals and two lab reports.
 *
 *   npm run db:seed
 *
 * Idempotent in effect: every run adds one more isolated demo user, never touches
 * existing rows. Runs migrations first so it works against an empty database. No
 * AI key is needed — the demo data is fixed, so the mock provider is used.
 */
const env = loadEnv({ ...process.env, AI_PROVIDER: 'mock' });
const logger = pino({ level: 'warn' });

await runMigrations(env.DATABASE_URL);
const { db, close } = createDb(env.DATABASE_URL);

try {
  const now = new Date();
  const clock: DemoClock = {
    today: now.toLocaleDateString('en-CA'), // YYYY-MM-DD in the local zone
    hour: now.getHours(),
    utcOffsetMinutes: -now.getTimezoneOffset(),
  };
  const user = await createContainer(db, createAiServices(env, logger)).demo.createDemoUser(clock);
  console.log(`Seeded demo user ${user.name} (${user.id})`);
  console.log(`Use it from any client with the header  x-user-id: ${user.id}`);
} finally {
  await close();
}
