import { createHash } from 'node:crypto';
import {
  bytes32FromHex,
  compareBytes,
  concatBytes,
  displayHashBytes,
  outpointDisplayBytes,
  u8be,
  u32be,
  u64be,
} from './scit.bytes';
import { scitAssert } from './scit.errors';

export const SCIT_TAGS = Object.freeze({
  network: 'SCIT/network/v1',
  birthId: 'SCIT/id/birth/v1',
  fusionId: 'SCIT/id/fuse/v1',
  state: 'SCIT/state/v1',
  permissions: 'SCIT/permissions/v1',
});

export interface ScitNetworkProfileInput {
  chainId: string;
  anchorHeight: number;
  anchorHash: string;
  activationHeight: number;
  baseScoutRoot: string;
}

export interface ScitBirthIdentityInput {
  profileId: string;
  seedOutpoint: { txid: string; vout: number };
  stateRoot: string;
  carrierScriptHex: string;
}

export interface ScitFusionParentIdentityInput {
  parentId: string;
  parentStateRoot: string;
  parentOutpoint: { txid: string; vout: number };
}

export interface ScitFusionIdentityInput {
  profileId: string;
  parents: readonly ScitFusionParentIdentityInput[];
  childStateRoot: string;
  childCarrierScriptHex: string;
}

export function sha256(value: Uint8Array): Buffer {
  return createHash('sha256').update(value).digest();
}

export function taggedHash(tag: string, message: Uint8Array): Buffer {
  scitAssert(
    typeof tag === 'string' && /^[\x20-\x7e]+$/.test(tag),
    'INVALID_TAG',
    'Tagged-hash tag must be non-empty printable ASCII',
  );
  const tagHash = sha256(Buffer.from(tag, 'ascii'));
  return sha256(concatBytes(tagHash, tagHash, message));
}

export function deriveProfileId(input: ScitNetworkProfileInput): Buffer {
  return taggedHash(
    SCIT_TAGS.network,
    concatBytes(
      displayHashBytes(input.chainId, 'chain id'),
      u32be(input.anchorHeight),
      displayHashBytes(input.anchorHash, 'anchor hash'),
      u32be(input.activationHeight),
      bytes32FromHex(input.baseScoutRoot, 'base Scout root'),
    ),
  );
}

export function deriveBirthOrganismId(input: ScitBirthIdentityInput): Buffer {
  const carrierScript = Buffer.from(input.carrierScriptHex, 'hex');
  scitAssert(
    carrierScript.length > 0 &&
      carrierScript.toString('hex') === input.carrierScriptHex.toLowerCase(),
    'INVALID_CARRIER_SCRIPT',
    'Carrier script must be non-empty, even-length hexadecimal',
  );
  return taggedHash(
    SCIT_TAGS.birthId,
    concatBytes(
      bytes32FromHex(input.profileId, 'profile id'),
      outpointDisplayBytes(input.seedOutpoint),
      bytes32FromHex(input.stateRoot, 'state root'),
      carrierScript,
    ),
  );
}

export function canonicalFusionParents(
  parents: readonly ScitFusionParentIdentityInput[],
): ScitFusionParentIdentityInput[] {
  scitAssert(
    parents.length >= 2 && parents.length <= 4,
    'INVALID_FUSION_ARITY',
    'Fusion identity requires two to four parents',
  );
  const sorted = [...parents].sort((left, right) =>
    compareBytes(
      bytes32FromHex(left.parentId, 'parent id'),
      bytes32FromHex(right.parentId, 'parent id'),
    ),
  );
  for (let index = 1; index < sorted.length; index += 1) {
    scitAssert(
      sorted[index - 1].parentId.toLowerCase() !==
        sorted[index].parentId.toLowerCase(),
      'DUPLICATE_FUSION_PARENT',
      'Fusion parent IDs must be unique',
    );
  }
  return sorted;
}

export function fusionParentTuple(
  parent: ScitFusionParentIdentityInput,
): Buffer {
  return concatBytes(
    bytes32FromHex(parent.parentId, 'parent id'),
    bytes32FromHex(parent.parentStateRoot, 'parent state root'),
    outpointDisplayBytes(parent.parentOutpoint),
  );
}

export function deriveFusionOrganismId(input: ScitFusionIdentityInput): Buffer {
  const parents = canonicalFusionParents(input.parents);
  const carrierScript = Buffer.from(input.childCarrierScriptHex, 'hex');
  scitAssert(
    carrierScript.length > 0 &&
      carrierScript.toString('hex') ===
        input.childCarrierScriptHex.toLowerCase(),
    'INVALID_CARRIER_SCRIPT',
    'Child carrier script must be non-empty, even-length hexadecimal',
  );
  return taggedHash(
    SCIT_TAGS.fusionId,
    concatBytes(
      bytes32FromHex(input.profileId, 'profile id'),
      u8be(parents.length),
      ...parents.map(fusionParentTuple),
      bytes32FromHex(input.childStateRoot, 'child state root'),
      carrierScript,
    ),
  );
}

export function deriveStateRoot(canonicalCbor: Uint8Array): Buffer {
  scitAssert(
    canonicalCbor.length > 0 && canonicalCbor.length <= 4096,
    'INVALID_MANIFEST_SIZE',
    'State manifest must contain between 1 and 4096 bytes',
  );
  return taggedHash(
    SCIT_TAGS.state,
    concatBytes(u64be(canonicalCbor.length), canonicalCbor),
  );
}

export function deriveZeroPermissionRoot(): Buffer {
  return taggedHash(SCIT_TAGS.permissions, Buffer.from([0xa0]));
}
