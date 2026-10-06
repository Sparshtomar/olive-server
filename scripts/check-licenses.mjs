#!/usr/bin/env node
/**
 * Licence gate for the production dependency tree.
 *
 * The API runs as a service rather than being distributed, so copyleft is a smaller
 * obligation here than in the app — but a GPL dependency is still a decision somebody
 * should make on purpose, and npm never mentions it. devDependencies are out of scope.
 *
 * Offline and dependency-free: every installed package declares its licence in its own
 * package.json, and the lockfile says which of them ship.
 *
 * Usage
 *   node scripts/check-licenses.mjs          fail on a forbidden licence
 *   node scripts/check-licenses.mjs --all    print the full licence inventory
 */
import fs from 'node:fs';

const SHOW_ALL = process.argv.includes('--all');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/** Permissive: no obligation beyond attribution. Matched against the SPDX id exactly. */
const PERMISSIVE = new Set([
  '0BSD',
  'Apache-2.0',
  'Apache-2.0 WITH LLVM-exception',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-1.1',
  'PSF-2.0',
  'Python-2.0',
  'Unlicense',
  'WTFPL',
  'Zlib',
  // Font licence: copyleft only over modified font files, no obligation on the app.
  'OFL-1.1',
]);

/** File-level copyleft. Fine to use as a separate module; reported for a human to decide. */
const WEAK_COPYLEFT = new Set([
  'MPL-2.0',
  'EPL-1.0',
  'EPL-2.0',
  'CDDL-1.0',
  'CDDL-1.1',
  'LGPL-2.1',
  'LGPL-3.0',
  'LGPL-2.1-only',
  'LGPL-3.0-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-or-later',
]);

/** Anything here in the shipped tree is a blocking finding. */
const isForbidden = (id) =>
  /^(A?GPL|SSPL|OSL|EUPL|RPL|CPAL|Sleepycat|Parity|CC-BY-NC)/i.test(id) ||
  /^(UNLICENSED|UNKNOWN|SEE LICENSE IN)/i.test(id);

/** Approved exceptions, each with a written reason. Empty today; keep it that way if possible. */
const APPROVED = new Map([]);

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

/** The SPDX-ish string a package declares, normalised. */
function licenseOf(dir) {
  try {
    const meta = JSON.parse(fs.readFileSync(`${dir}/package.json`, 'utf8'));
    if (typeof meta.license === 'string') return meta.license.trim();
    if (meta.license?.type) return String(meta.license.type).trim();
    // Pre-SPDX packages used an array, meaning "any one of these".
    if (Array.isArray(meta.licenses)) return meta.licenses.map((l) => l.type ?? l).join(' OR ');
    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

/** "(MIT OR Apache-2.0)" passes on its permissive half; "MIT AND GPL-3.0" does not. */
function grade(expr) {
  const clean = expr.replace(/[()]/g, '').trim();
  const alternatives = clean.split(/\s+OR\s+/i);
  if (alternatives.length > 1) {
    const grades = alternatives.map(grade);
    if (grades.includes('permissive')) return 'permissive';
    if (grades.includes('weak')) return 'weak';
    return 'forbidden';
  }
  const terms = clean.split(/\s+AND\s+/i).map((t) => t.trim());
  if (terms.some((t) => isForbidden(t))) return 'forbidden';
  if (terms.some((t) => WEAK_COPYLEFT.has(t))) return 'weak';
  if (terms.every((t) => PERMISSIVE.has(t))) return 'permissive';
  return 'unrecognised';
}

const findings = { forbidden: [], weak: [], unrecognised: [] };
const inventory = new Map();
let shipped = 0;

for (const [where, entry] of Object.entries(lock.packages ?? {})) {
  // The root project, dev-only packages and extraneous entries are not distributed.
  if (!where || entry.dev || entry.extraneous) continue;
  if (!fs.existsSync(where)) continue; // optional dependency skipped on this platform
  shipped++;
  const name = where.replace(/^.*node_modules\//, '');
  const license = licenseOf(where);
  inventory.set(`${name}@${entry.version ?? '?'}`, license);
  if (APPROVED.has(name)) continue;
  const verdict = grade(license);
  if (verdict !== 'permissive') findings[verdict].push({ name, version: entry.version, license });
}

const section = (title, items, note) => {
  if (!items.length) return;
  console.log(`\n${title} ${dim(`(${items.length}${note ? ', ' + note : ''})`)}`);
  for (const item of items) console.log(`   ${item.license.padEnd(24)} ${item.name}@${item.version}`);
};

section(red('x Forbidden licence in the shipped tree'), findings.forbidden);
section(yellow('! File-level copyleft — review the obligation'), findings.weak, 'advisory');
section(yellow('! Licence string not recognised — classify it'), findings.unrecognised, 'advisory');

if (SHOW_ALL) {
  const byLicense = new Map();
  for (const [pkg, license] of inventory) {
    if (!byLicense.has(license)) byLicense.set(license, []);
    byLicense.get(license).push(pkg);
  }
  console.log(`\n${dim('inventory')}`);
  for (const [license, pkgs] of [...byLicense].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`   ${String(pkgs.length).padStart(4)}  ${license}`);
  }
}

console.log(`\n${dim('checked:')} ${shipped} packages in the production tree`);

if (findings.forbidden.length) {
  console.log(
    red(`\n${findings.forbidden.length} forbidden licence${findings.forbidden.length === 1 ? '' : 's'}.`) +
      dim('\nReplace the package, or add it to APPROVED in this script with a written reason.'),
  );
  process.exit(1);
}
console.log(green('\nlicences OK.'));
