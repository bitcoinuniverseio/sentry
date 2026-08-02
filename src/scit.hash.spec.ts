import { outpointDisplayBytes, u32be, u64be } from './scit.bytes';
import {
  deriveBirthOrganismId,
  deriveFusionOrganismId,
  deriveProfileId,
  deriveZeroPermissionRoot,
  taggedHash,
} from './scit.hash';
import { SCIT_IDENTITY_VECTOR } from './scit.vectors';

describe('SCIT/1 tagged hashes and identity', () => {
  it('uses BIP340 tagged SHA-256 and unsigned big-endian integers', () => {
    expect(
      taggedHash('BIP0340/challenge', Buffer.alloc(0)).toString('hex'),
    ).toBe('c216d352f5818b7b4beacd4ae0a26fe888080823d2a598856661bcd54f1b3713');
    expect(u32be(0x01020304).toString('hex')).toBe('01020304');
    expect(u64be(0x0102030405060708n).toString('hex')).toBe('0102030405060708');
    expect(
      outpointDisplayBytes({ txid: '01'.repeat(32), vout: 2 }).toString('hex'),
    ).toBe(`${'01'.repeat(32)}00000002`);
  });

  it('matches the profile and birth identity vectors', () => {
    const profileId = deriveProfileId(SCIT_IDENTITY_VECTOR.profile).toString(
      'hex',
    );
    expect(profileId).toBe(SCIT_IDENTITY_VECTOR.profile.expectedProfileId);
    const birthId = deriveBirthOrganismId({
      profileId,
      seedOutpoint: {
        txid: SCIT_IDENTITY_VECTOR.birth.seedTxid,
        vout: SCIT_IDENTITY_VECTOR.birth.seedVout,
      },
      stateRoot: SCIT_IDENTITY_VECTOR.birth.stateRoot,
      carrierScriptHex: SCIT_IDENTITY_VECTOR.birth.carrierScriptHex,
    }).toString('hex');
    expect(birthId).toBe(SCIT_IDENTITY_VECTOR.birth.expectedOrganismId);
  });

  it('keeps a birth ID stable across fee replacements that retain input zero', () => {
    const common = {
      profileId: SCIT_IDENTITY_VECTOR.profile.expectedProfileId,
      seedOutpoint: {
        txid: SCIT_IDENTITY_VECTOR.birth.seedTxid,
        vout: SCIT_IDENTITY_VECTOR.birth.seedVout,
      },
      stateRoot: SCIT_IDENTITY_VECTOR.birth.stateRoot,
      carrierScriptHex: SCIT_IDENTITY_VECTOR.birth.carrierScriptHex,
    };
    const first = deriveBirthOrganismId(common).toString('hex');
    const replacement = deriveBirthOrganismId({ ...common }).toString('hex');
    expect(replacement).toBe(first);
    expect(
      deriveBirthOrganismId({
        ...common,
        seedOutpoint: {
          ...common.seedOutpoint,
          vout: common.seedOutpoint.vout + 1,
        },
      }).toString('hex'),
    ).not.toBe(first);
  });

  it('sorts fusion parent tuples before deriving the child ID', () => {
    const vector = SCIT_IDENTITY_VECTOR.fusion;
    const derive = (parents: typeof vector.parents) =>
      deriveFusionOrganismId({
        profileId: SCIT_IDENTITY_VECTOR.profile.expectedProfileId,
        parents,
        childStateRoot: vector.childStateRoot,
        childCarrierScriptHex: vector.childCarrierScriptHex,
      }).toString('hex');
    const expected = vector.expectedOrganismId;
    expect(derive(vector.parents)).toBe(expected);
    expect(
      derive([vector.parents[2], vector.parents[0], vector.parents[1]]),
    ).toBe(expected);
    expect(
      derive([vector.parents[1], vector.parents[2], vector.parents[0]]),
    ).toBe(expected);
  });

  it('matches the published empty-permission root', () => {
    expect(deriveZeroPermissionRoot().toString('hex')).toBe(
      'fa52f36e3698b88af6ee37e6166c91bf5e8e912a2fc337ba5267564ae4d420aa',
    );
  });
});
