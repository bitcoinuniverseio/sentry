import { encodeScitMarker } from './scit.marker';
import {
  ZERO_PERMISSION_CBOR,
  ZERO_PERMISSION_ROOT_HEX,
} from './scit.manifest';

const MARKER_ID = '11'.repeat(32);
const MARKER_ROOT = '22'.repeat(32);

export const SCIT_MARKER_VECTOR = Object.freeze({
  id: 'SCIT-MARKER-BIRTH-01',
  description: 'Exact marker-only SCIT/1 BIRTH example',
  payloadBytes: 74,
  scriptBytes: 76,
  organismId: MARKER_ID,
  stateRoot: MARKER_ROOT,
  scriptHex: '6a4a5343495401010000' + MARKER_ID + MARKER_ROOT + '0001',
});

export const SCIT_IDENTITY_VECTOR = Object.freeze({
  id: 'SCIT-IDENTITY-01',
  profile: Object.freeze({
    chainId: '00'.repeat(31) + '01',
    anchorHeight: 100,
    anchorHash: '00'.repeat(31) + '02',
    activationHeight: 200,
    baseScoutRoot: '33'.repeat(32),
    expectedProfileId:
      '4e3d9bdc5905ac59f35bb5c7319d6a7c25cbbcbd89b31c55b128b0b60cc2a86a',
  }),
  birth: Object.freeze({
    seedTxid: '44'.repeat(32),
    seedVout: 7,
    stateRoot: '33'.repeat(32),
    carrierScriptHex: '5120' + '55'.repeat(32),
    expectedOrganismId:
      'fc79449a1b0973e6c575cb1724fb652a2e364d758fc92a8898e47fb72d9591c2',
  }),
  fusion: Object.freeze({
    parents: Object.freeze([
      Object.freeze({
        parentId: '11'.repeat(32),
        parentStateRoot: '21'.repeat(32),
        parentOutpoint: Object.freeze({ txid: '31'.repeat(32), vout: 1 }),
      }),
      Object.freeze({
        parentId: '12'.repeat(32),
        parentStateRoot: '22'.repeat(32),
        parentOutpoint: Object.freeze({ txid: '32'.repeat(32), vout: 2 }),
      }),
      Object.freeze({
        parentId: '13'.repeat(32),
        parentStateRoot: '23'.repeat(32),
        parentOutpoint: Object.freeze({ txid: '33'.repeat(32), vout: 3 }),
      }),
    ]),
    childStateRoot: '66'.repeat(32),
    childCarrierScriptHex: '5120' + '77'.repeat(32),
    expectedOrganismId:
      'ea673d5c3f0f0f535eee1b4f5b9574da57bc1a75a3a0788675c11598b9568255',
  }),
});

export const SCIT_CONFORMANCE_VECTORS = Object.freeze({
  schemaVersion: 1 as const,
  wireVersion: 1 as const,
  marker: SCIT_MARKER_VECTOR,
  identity: SCIT_IDENTITY_VECTOR,
  zeroPermission: Object.freeze({
    canonicalCborHex: ZERO_PERMISSION_CBOR.toString('hex'),
    rootHex: ZERO_PERMISSION_ROOT_HEX,
  }),
});

if (
  encodeScitMarker({
    eventType: 'BIRTH',
    organismId: MARKER_ID,
    stateRoot: MARKER_ROOT,
  }).toString('hex') !== SCIT_MARKER_VECTOR.scriptHex
) {
  throw new Error('SCIT marker implementation does not match its vector');
}
