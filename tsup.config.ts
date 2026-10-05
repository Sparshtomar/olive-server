import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
});
