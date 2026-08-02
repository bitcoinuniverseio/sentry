#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadProtocol() {
  const built = join(here, 'dist', 'index.js');
  if (!existsSync(built)) {
    console.error('The reference implementation is not built yet. Run:');
    console.error('');
    console.error('  npm install && npm run build');
    console.error('');
    process.exit(2);
  }
  return require(built);
}

function usage() {
  console.log(`sentry - SCIT/1 reference tool

Usage:
  sentry decode <scriptHex>     Decode an OP_RETURN marker script into its fields
  sentry encode <event> <organismId> <stateRoot>
                                Build a marker script. Event is one of
                                BIRTH TRANSFER CHECKPOINT FUSE RETIRE
  sentry vectors                Print the conformance vectors as JSON
  sentry verify                 Recompute every vector and report agreement

Every value is lowercase hex. Organism IDs and state roots are 32 bytes.
This tool reads and writes bytes. It never touches a key, a wallet, or a node.
`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

if (!command || command === 'help' || command === '--help' || command === '-h') {
  usage();
  process.exit(0);
}

if (command === 'decode') {
  const [scriptHex] = args;
  if (!scriptHex) fail('decode needs a marker script in hex');
  const { decodeScitMarker } = loadProtocol();
  try {
    console.log(JSON.stringify(decodeScitMarker(scriptHex), null, 2));
  } catch (error) {
    fail(`${error.code ?? 'MARKER_INVALID'}: ${error.message}`);
  }
  process.exit(0);
}

if (command === 'encode') {
  const [eventType, organismId, stateRoot] = args;
  if (!eventType || !organismId || !stateRoot) {
    fail('encode needs an event type, an organism id, and a state root');
  }
  const { encodeScitMarker } = loadProtocol();
  try {
    const script = encodeScitMarker({ eventType, organismId, stateRoot });
    console.log(script.toString('hex'));
  } catch (error) {
    fail(`${error.code ?? 'MARKER_INVALID'}: ${error.message}`);
  }
  process.exit(0);
}

if (command === 'vectors') {
  const file = join(here, 'vectors', 'conformance.json');
  console.log(readFileSync(file, 'utf8').trimEnd());
  process.exit(0);
}

if (command === 'verify') {
  const {
    encodeScitMarker,
    decodeScitMarker,
    deriveProfileId,
    deriveBirthOrganismId,
    deriveFusionOrganismId,
    deriveZeroPermissionRoot,
    taggedHash,
    SCIT_IDENTITY_VECTOR,
    SCIT_MARKER_VECTOR,
  } = loadProtocol();

  const fixture = JSON.parse(
    readFileSync(join(here, 'vectors', 'conformance.json'), 'utf8'),
  );

  const checks = [];
  const record = (name, actual, expected) =>
    checks.push({ name, ok: actual === expected, actual, expected });

  record(
    'marker encode',
    encodeScitMarker({
      eventType: 'BIRTH',
      organismId: SCIT_MARKER_VECTOR.organismId,
      stateRoot: SCIT_MARKER_VECTOR.stateRoot,
    }).toString('hex'),
    fixture.marker.scriptHex,
  );

  const decoded = decodeScitMarker(fixture.marker.scriptHex);
  record('marker decode event', decoded.eventType, fixture.marker.eventType);
  record('marker decode organism', decoded.organismId, fixture.marker.organismId);
  record('marker decode root', decoded.stateRoot, fixture.marker.stateRoot);

  const profile = SCIT_IDENTITY_VECTOR.profile;
  record(
    'profile id',
    deriveProfileId({
      chainId: profile.chainId,
      anchorHeight: profile.anchorHeight,
      anchorHash: profile.anchorHash,
      activationHeight: profile.activationHeight,
      baseScoutRoot: profile.baseScoutRoot,
    }).toString('hex'),
    fixture.profileId,
  );

  const birth = SCIT_IDENTITY_VECTOR.birth;
  record(
    'birth organism id',
    deriveBirthOrganismId({
      profileId: fixture.profileId,
      seedOutpoint: { txid: birth.seedTxid, vout: birth.seedVout },
      stateRoot: birth.stateRoot,
      carrierScriptHex: birth.carrierScriptHex,
    }).toString('hex'),
    fixture.birthId,
  );

  const fusion = SCIT_IDENTITY_VECTOR.fusion;
  record(
    'fusion organism id',
    deriveFusionOrganismId({
      profileId: fixture.profileId,
      parents: fusion.parents,
      childStateRoot: fusion.childStateRoot,
      childCarrierScriptHex: fusion.childCarrierScriptHex,
    }).toString('hex'),
    fixture.fusionId,
  );

  record(
    'zero permission root',
    deriveZeroPermissionRoot().toString('hex'),
    fixture.zeroPermissionRoot,
  );

  record(
    'tagged hash matches BIP-340',
    taggedHash('BIP0340/challenge', Buffer.alloc(0)).toString('hex'),
    fixture.taggedHashEmptyChallenge,
  );

  let failures = 0;
  for (const check of checks) {
    if (check.ok) {
      console.log(`ok    ${check.name}`);
      continue;
    }
    failures += 1;
    console.log(`FAIL  ${check.name}`);
    console.log(`        expected ${check.expected}`);
    console.log(`        actual   ${check.actual}`);
  }

  console.log('');
  console.log(`${checks.length - failures}/${checks.length} vectors agree`);
  process.exit(failures === 0 ? 0 : 1);
}

fail(`unknown command "${command}". Run "sentry help".`);
