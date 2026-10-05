// @ts-check
// Architecture rules live here so they're enforced on every commit and in CI, not just described in the README.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const restrict = (...patterns) => ['error', { patterns }];

// ---------------------------------------------------------------------------
// Layer rules
//   app/container (composition root) → plugins → modules → ai, db, lib, config
//   Inside a module: routes → service → repository.
//   Modules use each other only through their index.ts (services + types, never repositories).
// ---------------------------------------------------------------------------
const crossModuleFromRoot = {
  regex: '^\\.\\./[^./][^/]*/',
  message: 'Use another module through its index (`../meals`), not its internals.',
};
const crossModuleFromNested = { regex: '^\\.\\./\\.\\./[^./][^/]*/', message: crossModuleFromRoot.message };
const routesSkipService = {
  regex: '\\.repository$',
  message: 'Routes call the service; only services touch repositories.',
};
const sharedInternals = {
  group: ['@sparshtomar/olive-shared/*'],
  message: 'Import the shared package from its root; its internals are not part of the contract.',
};

const layerRules = [
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: { 'no-restricted-imports': restrict(sharedInternals) },
  },
  {
    files: ['src/{lib,db,ai,config}/**'],
    rules: {
      'no-restricted-imports': restrict(sharedInternals, {
        regex: '(^|/)(modules|plugins)(/|$)|(^|/)(app|container|server)$',
        message: 'Infrastructure (lib, db, ai, config) must not depend on modules, plugins or the app.',
      }),
    },
  },
  {
    files: ['src/modules/*/*.ts'],
    rules: { 'no-restricted-imports': restrict(sharedInternals, crossModuleFromRoot) },
  },
  {
    files: ['src/modules/*/*/**/*.ts'],
    rules: { 'no-restricted-imports': restrict(sharedInternals, crossModuleFromNested) },
  },
  {
    files: ['src/modules/*/*.routes.ts'],
    rules: { 'no-restricted-imports': restrict(sharedInternals, crossModuleFromRoot, routesSkipService) },
  },
  {
    files: ['src/modules/*/*.repository.ts'],
    rules: {
      'no-restricted-imports': restrict(sharedInternals, crossModuleFromRoot, {
        regex: '\\.(service|routes)$',
        message: 'Repositories are the bottom of a module: no services or routes.',
      }),
    },
  },
  {
    files: ['src/plugins/**'],
    rules: {
      'no-restricted-imports': restrict(sharedInternals, {
        regex: '(^|/)modules/[^/]+/',
        message: crossModuleFromRoot.message,
      }),
    },
  },
];

export default defineConfig([
  globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/', 'drizzle/']),

  js.configs.recommended,
  {
    files: ['**/*.{ts,mts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  { languageOptions: { globals: globals.node } },

  // Rules that keep the problems seen in older codebases out of this one.
  {
    files: ['**/*.{ts,mts}'],
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: { project: ['tsconfig.json', 'packages/*/tsconfig.json'], noWarnOnMultipleProjects: true },
        node: true,
      },
    },
    rules: {
      // Type safety: no escape hatches.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Promises are awaited or explicitly `void`-ed; never silently dropped.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Fastify plugins and handlers are async by contract even when they don't await.
      '@typescript-eslint/require-await': 'off',
      // No debug logging left behind: the API has a structured logger.
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      // No god files. Split by responsibility long before this.
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      // Dependency graph stays acyclic, so modules can be understood and tested in isolation.
      'import/no-cycle': ['error', { ignoreExternal: true }],
      'import/no-duplicates': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  ...layerRules,

  // Tests and tooling: long fixtures are fine; CLI scripts may print.
  {
    files: ['**/test/**'],
    rules: {
      'max-lines': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Integration tests assert on parsed response bodies directly.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  { files: ['src/db/migrate.ts'], rules: { 'no-console': 'off' } },
]);
