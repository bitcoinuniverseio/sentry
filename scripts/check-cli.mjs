#!/usr/bin/env node
// Exercises the command line tool the way a first-time reader would, and fails
// loudly if any surface drifts. Run by CI on every push and pull request.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'cli.mjs');

const ORGANISM_ID = '11'.repeat(32);
const STATE_ROOT = '22'.repeat(32);

let failures = 0;

function run(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function expectFailure(args, label) {
  try {
    execFileSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch {
    console.log(`ok    ${label} is rejected`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${label} was accepted`);
}

function expect(label, actual, expected) {
  if (actual === expected) {
    console.log(`ok    ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${label}`);
  console.log(`        expected ${expected}`);
  console.log(`        actual   ${actual}`);
}

// Every event type survives an encode and decode round trip.
for (const eventType of ['BIRTH', 'TRANSFER', 'CHECKPOINT', 'FUSE', 'RETIRE']) {
  const script = run(['encode', eventType, ORGANISM_ID, STATE_ROOT]).trim();
  const decoded = JSON.parse(run(['decode', script]));
  expect(`${eventType} round trip`, decoded.eventType, eventType);
  expect(
    `${eventType} carrier vout`,
    String(decoded.carrierVout),
    eventType === 'RETIRE' ? '65535' : '1',
  );
}

// The published vectors decode to the values the fixture claims.
const vectors = JSON.parse(run(['vectors']));
const marker = JSON.parse(run(['decode', vectors.marker.scriptHex]));
expect('vector marker event', marker.eventType, vectors.marker.eventType);
expect('vector marker organism', marker.organismId, vectors.marker.organismId);
expect('vector marker root', marker.stateRoot, vectors.marker.stateRoot);

// Malformed input must never decode.
expectFailure(['decode', '6a4a00'], 'a truncated script');
expectFailure(['decode', '6b4a' + '00'.repeat(74)], 'a script without OP_RETURN');
expectFailure(['decode', '6a4c' + '00'.repeat(74)], 'a PUSHDATA1 encoding');
expectFailure(
  ['encode', 'BIRTH', '00'.repeat(32), STATE_ROOT],
  'a zero organism id',
);
expectFailure(['encode', 'SPROUT', ORGANISM_ID, STATE_ROOT], 'an unknown event');

console.log('');
if (failures > 0) {
  console.log(`${failures} command line check(s) failed`);
  process.exit(1);
}
console.log('command line tool behaves as documented');
