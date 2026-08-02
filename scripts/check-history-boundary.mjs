#!/usr/bin/env node
// The working tree being clean is not enough. A public repository discloses every
// commit that was ever pushed, so this replays the boundary rules over the full
// history of every blob git knows about.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const RULES = [
  {
    id: 'private-key-block',
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
  },
  {
    id: 'extended-private-key',
    pattern: /\b(?:xprv|tprv|yprv|zprv)[1-9A-HJ-NP-Za-km-z]{50,}/,
  },
  { id: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { id: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    id: 'generic-api-key-assignment',
    pattern:
      /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|db[_-]?password)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i,
  },
  {
    id: 'ip-address',
    pattern: /\b(?!0\.0\.0\.0|127\.0\.0\.1|255\.255\.255\.255)(?:\d{1,3}\.){3}\d{1,3}\b/,
  },
  {
    id: 'internal-hosting',
    pattern: /\b(?:powervps|cpanel|whm)\b/i,
  },
  {
    id: 'internal-runtime-flag',
    pattern: /\b(?:SENTRY_CITADEL_ENABLED|VITE_[A-Z0-9_]+|INSCRIBE_[A-Z0-9_]+)\b/,
  },
];

// Paths whose whole purpose is to name the forbidden patterns.
const EXEMPT = [
  'REPOSITORY-BOUNDARY.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'scripts/check-public-boundary.mjs',
  'scripts/check-history-boundary.mjs',
];

// A path exemption is not enough. An old revision of a scanner reached by an
// amend or a rebase survives as an unreferenced blob with no path at all, and a
// renamed file arrives under a name this list has never seen. Any blob carrying
// this marker is a scanner definition and is exempt wherever it turns up.
// boundary-scanner-definition: this file necessarily contains the patterns it forbids
const EXEMPT_MARKER = 'boundary-scanner-' + 'definition:';

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// Every object in the database, so this covers unreferenced and dangling blobs
// as well as anything reachable from a ref. Trees and commits are filtered out
// because only blob content can carry a credential.
const blobShas = new Set();
for (const line of git([
  'cat-file',
  '--batch-all-objects',
  '--batch-check=%(objectname) %(objecttype)',
]).split('\n')) {
  const [sha, type] = line.trim().split(' ');
  if (type === 'blob') blobShas.add(sha);
}

// Map each blob to the path it was stored under, for a readable report.
const pathBySha = new Map();
for (const line of git(['rev-list', '--objects', '--all']).split('\n')) {
  const space = line.indexOf(' ');
  if (space === -1) continue;
  pathBySha.set(line.slice(0, space), line.slice(space + 1).trim());
}

const blobs = [];
for (const sha of blobShas) {
  const path = pathBySha.get(sha) ?? '(unreferenced blob)';
  if (EXEMPT.includes(path)) continue;
  if (path.startsWith('node_modules/') || path.startsWith('dist/')) continue;
  blobs.push({ sha, path });
}

const violations = [];
const seen = new Set();

for (const blob of blobs) {
  if (seen.has(blob.sha)) continue;
  seen.add(blob.sha);

  let content;
  try {
    content = git(['cat-file', 'blob', blob.sha]);
  } catch {
    continue;
  }
  if (content.includes('\u0000')) continue;

  if (content.includes(EXEMPT_MARKER)) continue;

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const rule of RULES) {
      const match = rule.pattern.exec(line);
      if (!match) continue;
      violations.push({
        path: blob.path,
        sha: blob.sha.slice(0, 12),
        line: index + 1,
        rule: rule.id,
        text: match[0].slice(0, 80),
      });
    }
  }
}

console.log(`scanned ${seen.size} unique blobs across all refs`);

if (violations.length === 0) {
  console.log('history boundary clean');
  process.exit(0);
}

console.error('');
console.error('Forbidden content exists in this repository history:');
console.error('');
for (const violation of violations) {
  console.error(`  ${violation.path} (blob ${violation.sha}) line ${violation.line}`);
  console.error(`    rule:    ${violation.rule}`);
  console.error(`    matched: ${violation.text}`);
  console.error('');
}
console.error('Removing the file from the current tree does not fix this. Rotate any');
console.error('exposed credential at its provider first, then rewrite history.');
process.exit(1);
