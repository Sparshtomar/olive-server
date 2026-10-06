#!/usr/bin/env node
/**
 * Diff-coverage gate: were the lines THIS change added or modified covered by a test?
 *
 * Per-diff rather than repo-wide: existing code is not the standard, new code is. It
 * encodes the actual rule — new logic ships with tests — without a backfill first.
 *
 * Usage
 *   node scripts/check-coverage.mjs                 compare against origin/main
 *   node scripts/check-coverage.mjs --base <ref>    compare against a ref/sha
 *   node scripts/check-coverage.mjs --min 60        override the threshold
 *   node scripts/check-coverage.mjs --report        per-file detail, never fails
 *
 * Expects coverage/coverage-final.json — run `npm run test:coverage` first.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const REPORT_ONLY = argv.includes('--report');
const MIN = Number(flag('--min', 70));
const BASE = flag('--base', 'origin/main');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/**
 * Files whose changed lines are not held to the threshold: process entrypoints and the
 * code that talks to the real model (exercised by hand, not by the suite). Routes,
 * services and repositories are all reached by the integration tests and are measured.
 */
const EXEMPT = [
  /^src\/(server|seed)\.ts$/,
  /^src\/db\/migrate\.ts$/,
  /^src\/ai\/gemini\/(gemini-analyzers|structured-client)\.ts$/,
  /\.d\.ts$/,
];

/** Only this tree is measured at all. */
const MEASURED = /^src\//;
const INSTRUMENTABLE = /\.(ts|tsx|mjs|js)$/;

const COVERAGE_FILE = 'coverage/coverage-final.json';
if (!fs.existsSync(COVERAGE_FILE)) {
  console.log(red(`x ${COVERAGE_FILE} not found`) + dim(' — run `npm run test:coverage` first'));
  process.exit(1);
}

/**
 * Which lines the diff added or modified, per file. `--unified=0` so a hunk is exactly
 * the changed lines, not three lines of untouched context either side.
 */
function changedLines(base) {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let diff;
  let untracked = [];
  try {
    // merge-base, then diff to the WORKING TREE: if main has moved on, diffing its tip would
    // count other people's commits as ours; diffing HEAD would see nothing when run locally
    // before committing. In CI the working tree equals HEAD, so both readings agree.
    const mergeBase = git(['merge-base', base, 'HEAD']).trim();
    diff = git(['diff', '--unified=0', '--diff-filter=AM', mergeBase]);
    // New files git has never seen are in no diff; every line in them counts as added.
    untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  } catch (err) {
    console.log(red(`x could not diff against ${base}`));
    console.log(
      '   ' +
        String(err.stderr || err.message)
          .trim()
          .split('\n')[0],
    );
    console.log(dim('   In CI, pass the PR base: --base origin/$GITHUB_BASE_REF. Locally, `git fetch origin`.'));
    process.exit(1);
  }

  const byFile = new Map();
  for (const file of untracked) {
    if (!MEASURED.test(file) || !fs.existsSync(file)) continue;
    const total = fs.readFileSync(file, 'utf8').split('\n').length;
    byFile.set(file, new Set(Array.from({ length: total }, (_, i) => i + 1)));
  }
  let file = null;
  for (const line of diff.split('\n')) {
    const header = /^\+\+\+ b\/(.+)$/.exec(line);
    if (header) {
      file = header[1];
      continue;
    }
    // @@ -old,n +start,count @@ — count omitted means 1.
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && file) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count === 0) continue; // pure deletion
      if (!byFile.has(file)) byFile.set(file, new Set());
      for (let n = start; n < start + count; n++) byFile.get(file).add(n);
    }
  }
  return byFile;
}

/**
 * Istanbul-shaped coverage keyed by absolute path, reduced to "which lines ran". Read from
 * statementMap + s counts rather than the `lines` summary, which v8 reports may leave empty.
 */
function coveredLines() {
  const raw = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
  const byFile = new Map();
  for (const [absolute, entry] of Object.entries(raw)) {
    const rel = path.relative(process.cwd(), absolute).split(path.sep).join('/');
    const covered = new Set();
    const known = new Set();
    for (const [id, loc] of Object.entries(entry.statementMap ?? {})) {
      const hits = entry.s?.[id] ?? 0;
      for (let n = loc.start.line; n <= (loc.end.line ?? loc.start.line); n++) {
        known.add(n);
        if (hits > 0) covered.add(n);
      }
    }
    byFile.set(rel, { covered, known });
  }
  return byFile;
}

const changed = changedLines(BASE);
const covered = coveredLines();

const rows = [];
let totalNew = 0;
let totalCovered = 0;

for (const [file, lines] of [...changed].sort()) {
  if (!MEASURED.test(file) || !INSTRUMENTABLE.test(file)) continue;
  if (EXEMPT.some((re) => re.test(file))) continue;

  const info = covered.get(file);
  // A file the report never mentions was loaded by no test: every changed line is uncovered.
  const hit = info?.covered ?? new Set();
  const instrumented = info?.known;

  // Lines with no statement (a brace, a type, an import) cannot be covered and are not counted.
  const countable = instrumented ? [...lines].filter((n) => instrumented.has(n)) : [...lines];
  if (countable.length === 0) continue;

  const hits = countable.filter((n) => hit.has(n)).length;
  totalNew += countable.length;
  totalCovered += hits;
  rows.push({
    file,
    total: countable.length,
    hits,
    pct: (hits / countable.length) * 100,
    missing: countable.filter((n) => !hit.has(n)),
  });
}

const overall = totalNew === 0 ? 100 : (totalCovered / totalNew) * 100;
const fmt = (n) => `${n.toFixed(1)}%`;

if (rows.length) {
  console.log(`\n${dim(`changed lines vs ${BASE}`)}`);
  for (const row of rows.sort((a, b) => a.pct - b.pct)) {
    const colour = row.pct >= MIN ? green : row.pct > 0 ? yellow : red;
    const missing = row.missing.length
      ? dim(`\n            uncovered: ${row.missing.slice(0, 20).join(', ')}${row.missing.length > 20 ? ', …' : ''}`)
      : '';
    console.log(
      `   ${colour(fmt(row.pct).padStart(6))} ${`${row.hits}/${row.total}`.padStart(8)}  ${row.file}${missing}`,
    );
  }
}

if (totalNew === 0) {
  console.log(green('\nno testable lines changed.') + dim(' Nothing to cover.'));
  process.exit(0);
}

console.log(
  `\n${dim('diff coverage:')} ${fmt(overall)} ${dim(`(${totalCovered}/${totalNew} changed lines, threshold ${MIN}%)`)}`,
);

if (overall < MIN && !REPORT_ONLY) {
  console.log(
    red(`\nBelow the ${MIN}% threshold for changed lines.`) +
      dim(
        '\nAdd tests for what you changed. If it genuinely needs a renderer, move the logic into a lib module instead of widening EXEMPT.',
      ),
  );
  process.exit(1);
}
console.log(green('\ncoverage OK.'));
