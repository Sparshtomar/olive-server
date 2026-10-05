import { defineConfig } from 'tsup';

// Published as ESM + CJS with type declarations, so Node (the API) and Metro (the app) both consume it as-is.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // tsup's declaration build sets `baseUrl` internally, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
