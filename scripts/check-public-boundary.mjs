#!/usr/bin/env node
// Enforces REPOSITORY-BOUNDARY.md mechanically. This repository is public, so a
// mistake here is permanent. CI fails the build rather than trusting review alone.
//
// boundary-scanner-definition: this file necessarily contains the patterns it
// forbids, so the history scanner exempts it by this marker rather than by path.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.github/workflows',
]);

// Files whose whole purpose is to name the forbidden patterns. Paths use forward
// slashes so the set matches on every platform.
const SKIP_FILES = new Set([
  'REPOSITORY-BOUNDARY.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'scripts/check-public-boundary.mjs',
  'scripts/check-history-boundary.mjs',
]);

// Each rule states what it forbids and why, so a failure explains itself.
const RULES = [
  {
    id: 'private-key-block',
    why: 'A PEM private key block must never exist in any repository.',
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
  },
  {
    id: 'extended-private-key',
    why: 'An extended private key grants spend authority over a whole wallet.',
    pattern: /\b(?:xprv|tprv|yprv|zprv)[1-9A-HJ-NP-Za-km-z]{50,}/,
  },
  {
    id: 'github-token',
    why: 'A GitHub token grants repository and organization access.',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  },
  {
    id: 'aws-access-key',
    why: 'An AWS access key ID indicates a committed cloud credential.',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: 'generic-api-key-assignment',
    why: 'A credential assigned a literal value belongs in a secret manager.',
    pattern:
      /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|db[_-]?password)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i,
  },
  {
    id: 'ip-address',
    why: 'A literal IP address exposes infrastructure. Use a placeholder name.',
    pattern: /\b(?!0\.0\.0\.0|127\.0\.0\.1|255\.255\.255\.255)(?:\d{1,3}\.){3}\d{1,3}\b/,
  },
  {
    id: 'internal-hosting',
    why: 'Hosting and control panel names describe how we run our systems.',
    pattern: /\b(?:powervps|cpanel|whm|pm2\.config|ecosystem\.config)\b/i,
  },
  {
    id: 'internal-runtime-flag',
    why: 'Deployment flags belong to the private repository, not the protocol.',
    pattern: /\b(?:SENTRY_CITADEL_ENABLED|VITE_[A-Z0-9_]+|INSCRIBE_[A-Z0-9_]+)\b/,
  },
  {
    id: 'mainnet-activation',
    why: 'No mainnet profile exists. Publishing an activation height would be a false claim.',
    pattern: /\bmainnet[_-]?(?:activation|profile)\s*[:=]\s*(?!absent|null|none)\w/i,
  },
];

function walk(directory, found = []) {
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    const rel = relative(root, absolute).split(sep).join('/');
    if (SKIP_DIRS.has(entry) || SKIP_DIRS.has(rel)) continue;
    const info = statSync(absolute);
    if (info.isDirectory()) {
      walk(absolute, found);
      continue;
    }
    found.push(absolute);
  }
  return found;
}

function isProbablyText(buffer) {
  return !buffer.includes(0);
}

const violations = [];

for (const file of walk(root)) {
  const rel = relative(root, file).split(sep).join('/');
  if (SKIP_FILES.has(rel)) continue;

  const raw = readFileSync(file);
  if (!isProbablyText(raw)) continue;

  const lines = raw.toString('utf8').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const rule of RULES) {
      const match = rule.pattern.exec(line);
      if (!match) continue;
      violations.push({
        file: rel,
        line: index + 1,
        rule: rule.id,
        why: rule.why,
        text: match[0].slice(0, 80),
      });
    }
  }
}

if (violations.length === 0) {
  console.log('public boundary clean');
  process.exit(0);
}

console.error('This repository is public. The following must not be committed:');
console.error('');
for (const violation of violations) {
  console.error(`  ${violation.file}:${violation.line}  [${violation.rule}]`);
  console.error(`    matched: ${violation.text}`);
  console.error(`    reason:  ${violation.why}`);
  console.error('');
}
console.error('See REPOSITORY-BOUNDARY.md. If a match is a false positive, narrow');
console.error('the rule in scripts/check-public-boundary.mjs and say why in the pull request.');
process.exit(1);
