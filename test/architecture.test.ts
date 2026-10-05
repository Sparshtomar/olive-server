// Structure rules ESLint can't express. Layering and import rules live in eslint.config.mjs.
import { readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const MODULES = join(SRC, 'modules');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = walk(SRC).map((f) => relative(SRC, f).split(sep).join('/'));
const modules = readdirSync(MODULES);

/** The roles a file may play inside a module: `<module>.<role>.ts`, module name singular or plural (meals/meal.service.ts). */
const ROLES = ['routes', 'service', 'repository', 'mapper', 'data'];

describe('modules', () => {
  it.each(modules)('%s exposes a public API through index.ts', (mod) => {
    expect(files).toContain(`modules/${mod}/index.ts`);
  });

  it.each(modules)('%s names files <module>.<role>.ts', (mod) => {
    const rootFiles = readdirSync(join(MODULES, mod)).filter((e) => statSync(join(MODULES, mod, e)).isFile());
    const names = [...new Set([mod, mod.replace(/s$/, '')])].join('|');
    const allowed = new RegExp(`^(index|(${names})\\.(${ROLES.join('|')}))\\.ts$`);
    expect(rootFiles.filter((f) => !allowed.test(f))).toEqual([]);
  });
});

describe('naming', () => {
  it('has no grab-bag modules', () => {
    expect(files.filter((f) => /^(helpers?|utils?|misc|common|stuff)$/i.test(basename(f, extname(f))))).toEqual([]);
  });

  it('uses kebab-case file names', () => {
    expect(files.filter((f) => !/^[a-z][a-z0-9.-]*\.ts$/.test(basename(f)))).toEqual([]);
  });
});
