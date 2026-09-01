#!/usr/bin/env node
// A complete Sentry lifecycle, from birth to retirement, computed locally.
// No node, no wallet, no network. Run it with: node examples/quickstart.mjs
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const built = join(root, 'dist', 'index.js');

if (!existsSync(built)) {
  console.error('Build the reference implementation first: npm install && npm run build');
  process.exit(2);
}

const {
  encodeScitMarker,
  decodeScitMarker,
  deriveProfileId,
  deriveBirthOrganismId,
  deriveFusionOrganismId,
  deriveZeroPermissionRoot,
  encodeScitManifest,
  deriveStateRoot,
} = createRequire(import.meta.url)(built);

const line = (label, value) => console.log(`${label.padEnd(22)} ${value}`);

// 1. A network profile. Regtest values, because no mainnet profile exists.
console.log('\n1. Network profile');
const profileId = deriveProfileId({
  chainId: '00'.repeat(31) + '01',
  anchorHeight: 100,
  anchorHash: '00'.repeat(31) + '02',
  activationHeight: 200,
  baseScoutRoot: '33'.repeat(32),
}).toString('hex');
line('profile id', profileId);

// 2. A newborn Scout commits to a manifest with provably zero permissions.
console.log('\n2. Birth state');
const zeroPermissionRoot = deriveZeroPermissionRoot().toString('hex');
line('zero permission root', zeroPermissionRoot);

const manifestBytes = encodeScitManifest({
  schemaVersion: 1,
  species: 1,
  predecessors: [],
  safetyKernelRoot: 'aa'.repeat(32),
  constraintsRoot: 'bb'.repeat(32),
  moduleSetRoot: 'cc'.repeat(32),
  publicSkillRoot: null,
  publicMemoryRoot: null,
  visualRoot: null,
  externalPermissionRoot: zeroPermissionRoot,
  extensions: {},
});
const stateRoot = deriveStateRoot(manifestBytes).toString('hex');
line('manifest bytes', `${manifestBytes.length} bytes of canonical CBOR`);
line('state root', stateRoot);

// 3. Identity comes from the seed outpoint, never from an unconfirmed txid.
console.log('\n3. Identity');
const organismId = deriveBirthOrganismId({
  profileId,
  seedOutpoint: { txid: '44'.repeat(32), vout: 7 },
  stateRoot,
  carrierScriptHex: '5120' + '55'.repeat(32),
}).toString('hex');
line('organism id', organismId);

// 4. The on-chain marker. Seventy-six bytes, output zero, value zero.
console.log('\n4. Lifecycle markers');
for (const eventType of ['BIRTH', 'TRANSFER', 'CHECKPOINT', 'RETIRE']) {
  const script = encodeScitMarker({ eventType, organismId, stateRoot });
  const decoded = decodeScitMarker(script);
  line(
    eventType,
    `${script.length} bytes, carrier_vout 0x${decoded.carrierVout.toString(16).padStart(4, '0')}`,
  );
}

// 5. Fusion retires its parents and derives a child from their sorted tuples.
console.log('\n5. Fusion');
const childId = deriveFusionOrganismId({
  profileId,
  parents: [
    {
      parentId: '13'.repeat(32),
      parentStateRoot: '23'.repeat(32),
      parentOutpoint: { txid: '33'.repeat(32), vout: 3 },
    },
    {
      parentId: '11'.repeat(32),
      parentStateRoot: '21'.repeat(32),
      parentOutpoint: { txid: '31'.repeat(32), vout: 1 },
    },
    {
      parentId: '12'.repeat(32),
      parentStateRoot: '22'.repeat(32),
      parentOutpoint: { txid: '32'.repeat(32), vout: 2 },
    },
  ],
  childStateRoot: '66'.repeat(32),
  childCarrierScriptHex: '5120' + '77'.repeat(32),
}).toString('hex');
line('child organism id', childId);
console.log('\nParents were supplied out of order and sorted canonically, so the');
console.log('child ID is independent of the order the caller happened to use.');

console.log('\nNothing above touched a key, a wallet, or a network.\n');
