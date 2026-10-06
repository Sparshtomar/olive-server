#!/usr/bin/env node
/**
 * Vulnerability gate for the production dependency tree.
 *
 * Runs `npm audit` and fails on high/critical advisories not on the accepted list. It
 * needs the network and changes when somebody else publishes something, so it runs weekly
 * (.github/workflows/dependency-audit.yml) rather than on every pull request - a gate that
 * turns unrelated PRs red is a gate that gets deleted.
 *
 * `npm audit` has no allowlist, only "block on everything" or "ignore everything". Most of
 * what it reports in an Expo app lives in the CLI and config plugins - build-time code on
 * our machines, pinned by the SDK, never shipped. So each accepted advisory carries a
 * reason and a review date; past the date it counts as unaccepted again and this goes red.
 *
 * devDependencies are out of scope (`--omit=dev`): a hole in a build tool is a hole in CI,
 * not in the API.
 *
 * Usage
 *   node scripts/check-audit.mjs          high/critical block, the rest advisory
 *   node scripts/check-audit.mjs --all    list every advisory, any severity
 */
import { execFileSync } from 'node:child_process';

const SHOW_ALL = process.argv.includes('--all');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const BLOCKING = new Set(['high', 'critical']);

/**
 * Advisories we have looked at and decided to carry, keyed by the GitHub advisory id npm
 * reports. `until` is a review date. Adding an entry means writing down the actual
 * exposure - "transitive dependency" is not a reason; "runs only in the CLI on our
 * machines" is.
 */
const ACCEPTED = new Map([]);

// Today as a plain date string, so comparison is lexicographic and timezone-free.
const TODAY = new Date().toISOString().slice(0, 10);

let report;
try {
  // npm audit exits non-zero whenever it finds anything, so the payload usually arrives via the error.
  report = JSON.parse(execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' }));
} catch (err) {
  if (typeof err.stdout === 'string' && err.stdout.trim().startsWith('{')) report = JSON.parse(err.stdout);
  else {
    console.log(red('x npm audit did not run'));
    console.log(
      '   ' +
        String(err.stderr || err.message)
          .trim()
          .split('\n')
          .slice(0, 5)
          .join('\n   '),
    );
    process.exit(1);
  }
}

/** One row per distinct advisory: npm repeats the same one down every transitive path. */
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== 'object' || !via.source) continue;
    if (!advisories.has(via.source)) {
      advisories.set(via.source, {
        id: via.source,
        name: via.name,
        severity: via.severity,
        title: via.title,
        fixAvailable: vuln.fixAvailable,
        reachedVia: new Set(),
      });
    }
    if (vuln.name !== via.name) advisories.get(via.source).reachedVia.add(vuln.name);
  }
}

const buckets = { blocking: [], expired: [], accepted: [], advisory: [], stale: [] };
for (const advisory of advisories.values()) {
  const accepted = ACCEPTED.get(advisory.id);
  if (accepted && accepted.until < TODAY) buckets.expired.push({ ...advisory, ...accepted });
  else if (accepted) buckets.accepted.push({ ...advisory, ...accepted });
  else if (BLOCKING.has(advisory.severity)) buckets.blocking.push(advisory);
  else buckets.advisory.push(advisory);
}
// An accepted entry for an advisory that no longer appears is dead weight on the allowlist.
for (const [id, entry] of ACCEPTED) {
  if (!advisories.has(id)) buckets.stale.push({ id, ...entry });
}

const line = (a) =>
  `${String(a.id).padEnd(8)} ${a.severity.padEnd(9)} ${a.name}${a.reachedVia?.size ? dim(` (via ${[...a.reachedVia].slice(0, 3).join(', ')})`) : ''}\n` +
  `         ${dim(a.title.slice(0, 100))}` +
  (a.fixAvailable === false ? `\n         ${yellow('no fix published')}` : '');

const section = (title, items, format = line) => {
  if (!items.length) return;
  console.log(`\n${title} ${dim(`(${items.length})`)}`);
  for (const item of items) console.log('   ' + format(item));
};

section(red('x High or critical, and not on the accepted list'), buckets.blocking);
section(
  red('x Accepted, but past its review date'),
  buckets.expired,
  (a) =>
    `${line(a)}\n         ${red(`review was due ${a.until}`)} ${dim('- re-check the reasoning, then move the date or fix it')}`,
);
section(
  yellow('! Accepted entry for an advisory that is no longer reported'),
  buckets.stale,
  (a) => `${a.id}  ${dim('remove it from ACCEPTED in scripts/check-audit.mjs')}`,
);
if (SHOW_ALL) {
  section(dim('· Accepted'), buckets.accepted, (a) => `${line(a)}\n         ${dim(`until ${a.until} - ${a.why}`)}`);
  section(dim('· Below the blocking threshold'), buckets.advisory);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `\n${dim('checked:')} ${report.metadata?.dependencies?.prod ?? '?'} production packages, ${advisories.size} distinct advisories ` +
    dim(
      `(npm: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low)`,
    ),
);

const failures = buckets.blocking.length + buckets.expired.length;
if (failures) {
  console.log(
    red(`\n${failures} advisor${failures === 1 ? 'y' : 'ies'} needs a decision.`) +
      dim('\nFix it, or add it to ACCEPTED in scripts/check-audit.mjs with a reason and a review date.'),
  );
  process.exit(1);
}
console.log(
  green('\naudit OK.') + dim(` ${buckets.accepted.length} accepted, ${buckets.advisory.length} below threshold.`),
);
