import { runMigrations } from '../src/db/migrate';

export default async function setup() {
  await runMigrations(process.env.TEST_DATABASE_URL ?? 'postgres://olive:olive@localhost:5432/olive_test');
}
