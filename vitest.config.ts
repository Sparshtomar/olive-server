import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // packages/shared has its own suite (`npm test` runs both).
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Integration suites share one test database; run files one at a time.
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://olive:olive@localhost:5432/olive_test',
    },
  },
});
