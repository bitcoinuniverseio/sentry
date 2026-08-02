#!/usr/bin/env node
// The reference implementation is the thing other people check their work
// against, so its supply chain is part of its trustworthiness. It must depend on
// nothing at runtime beyond the Node standard library.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const problems = [];

for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  const names = Object.keys(manifest[field] ?? {});
  if (names.length > 0) {
    problems.push(`${field} must be empty, found: ${names.join(', ')}`);
  }
}

if (problems.length > 0) {
  console.error('The published package must have no runtime dependency.');
  console.error('');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('');
  console.error('If a dependency is genuinely required, say why in the pull request');
  console.error('and update this check deliberately rather than removing it.');
  process.exit(1);
}

console.log('no runtime dependencies');
