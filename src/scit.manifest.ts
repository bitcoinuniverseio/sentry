import { bytes32FromHex, compareHexBytes, isZeroBytes } from './scit.bytes';
import {
  decodeRestrictedCbor,
  encodeRestrictedCbor,
  type ScitCborValue,
} from './scit.cbor';
import { scitAssert } from './scit.errors';
import { deriveStateRoot, deriveZeroPermissionRoot } from './scit.hash';

export const SCIT_MANIFEST_SCHEMA_VERSION = 1;
export const SCIT_SPECIES_SCOUT = 1;
export const SCIT_REGISTERED_EXTENSION_KEYS = Object.freeze([0, 1, 2, 3, 4]);
export const ZERO_PERMISSION_CBOR = Buffer.from([0xa0]);
export const ZERO_PERMISSION_ROOT_HEX =
  deriveZeroPermissionRoot().toString('hex');

export interface ScitManifestPredecessor {
  organismId: string;
  stateRoot: string;
}

export interface ScitManifestV1 {
  schemaVersion: 1;
  species: 1;
  predecessors: readonly ScitManifestPredecessor[];
  safetyKernelRoot: string;
  constraintsRoot: string;
  moduleSetRoot: string;
  publicSkillRoot: string | null;
  publicMemoryRoot: string | null;
  visualRoot: string | null;
  externalPermissionRoot: string;
  extensions: Readonly<Record<number, string>>;
}

export interface ScitManifestValidationContext {
  originEvent?: 'BIRTH' | 'CHECKPOINT' | 'FUSE';
  expectedPredecessors?: readonly ScitManifestPredecessor[];
  zeroPermissionRoot?: string;
}

export interface DecodedScitManifest {
  manifest: ScitManifestV1;
  canonicalBytes: Buffer;
  stateRoot: string;
}

export function encodeScitManifest(
  manifest: ScitManifestV1,
  context: ScitManifestValidationContext = {},
): Buffer {
  validateScitManifest(manifest, context);
  const extensions = new Map<number, ScitCborValue>();
  for (const [key, value] of Object.entries(manifest.extensions)) {
    extensions.set(Number(key), bytes32FromHex(value, `extension root ${key}`));
  }
  const map = new Map<number, ScitCborValue>([
    [0, 1],
    [1, 1],
    [
      2,
      manifest.predecessors.map((predecessor) => [
        bytes32FromHex(predecessor.organismId, 'predecessor organism id'),
        bytes32FromHex(predecessor.stateRoot, 'predecessor state root'),
      ]),
    ],
    [3, bytes32FromHex(manifest.safetyKernelRoot, 'safety-kernel root')],
    [4, bytes32FromHex(manifest.constraintsRoot, 'constraints root')],
    [5, bytes32FromHex(manifest.moduleSetRoot, 'module-set root')],
    [6, nullableRoot(manifest.publicSkillRoot, 'public skill root')],
    [7, nullableRoot(manifest.publicMemoryRoot, 'public-memory root')],
    [8, nullableRoot(manifest.visualRoot, 'visual root')],
    [
      9,
      bytes32FromHex(
        manifest.externalPermissionRoot,
        'external-permission-set root',
      ),
    ],
    [10, extensions],
  ]);
  return encodeRestrictedCbor(map);
}

export function decodeScitManifest(
  bytes: Uint8Array,
  context: ScitManifestValidationContext = {},
): DecodedScitManifest {
  const decoded = decodeRestrictedCbor(bytes);
  scitAssert(
    decoded instanceof Map,
    'MANIFEST_TOP_LEVEL',
    'SCIT v1 manifest must be a CBOR map',
  );
  assertExactKeys(
    decoded,
    Array.from({ length: 11 }, (_, index) => index),
  );
  scitAssert(
    decoded.get(0) === 1,
    'MANIFEST_SCHEMA_VERSION',
    'SCIT manifest schema version must be 1',
  );
  scitAssert(
    decoded.get(1) === 1,
    'MANIFEST_SPECIES',
    'SCIT v1 species must be Scout',
  );
  const predecessorValue = decoded.get(2);
  scitAssert(
    Array.isArray(predecessorValue),
    'MANIFEST_PREDECESSORS',
    'SCIT manifest predecessors must be an array',
  );
  const predecessors = predecessorValue.map((value, index) => {
    scitAssert(
      Array.isArray(value) && value.length === 2,
      'MANIFEST_PREDECESSOR_TUPLE',
      `Predecessor ${index} must be a two-item array`,
    );
    return {
      organismId: requiredDigest(value[0], `predecessor ${index} organism id`),
      stateRoot: requiredDigest(value[1], `predecessor ${index} state root`),
    };
  });
  const extensionValue = decoded.get(10);
  scitAssert(
    extensionValue instanceof Map,
    'MANIFEST_EXTENSIONS',
    'SCIT manifest extensions must be a map',
  );
  const extensions: Record<number, string> = {};
  for (const [key, value] of extensionValue) {
    scitAssert(
      SCIT_REGISTERED_EXTENSION_KEYS.includes(key),
      'MANIFEST_EXTENSION_KEY',
      `SCIT v1 extension key ${key} is not registered`,
    );
    extensions[key] = requiredDigest(value, `extension root ${key}`);
  }
  const manifest: ScitManifestV1 = {
    schemaVersion: 1,
    species: 1,
    predecessors,
    safetyKernelRoot: requiredDigest(decoded.get(3), 'safety-kernel root'),
    constraintsRoot: requiredDigest(decoded.get(4), 'constraints root'),
    moduleSetRoot: requiredDigest(decoded.get(5), 'module-set root'),
    publicSkillRoot: optionalDigest(decoded.get(6), 'public skill root'),
    publicMemoryRoot: optionalDigest(decoded.get(7), 'public-memory root'),
    visualRoot: optionalDigest(decoded.get(8), 'visual root'),
    externalPermissionRoot: requiredDigest(
      decoded.get(9),
      'external-permission-set root',
    ),
    extensions,
  };
  validateScitManifest(manifest, context);
  const canonicalBytes = Buffer.from(bytes);
  const reencoded = encodeScitManifest(manifest, context);
  scitAssert(
    canonicalBytes.equals(reencoded),
    'MANIFEST_NONCANONICAL',
    'SCIT manifest differs from its canonical deterministic encoding',
  );
  return {
    manifest,
    canonicalBytes,
    stateRoot: deriveStateRoot(canonicalBytes).toString('hex'),
  };
}

export function validateScitManifest(
  manifest: ScitManifestV1,
  context: ScitManifestValidationContext = {},
): void {
  scitAssert(
    manifest.schemaVersion === 1 && manifest.species === 1,
    'MANIFEST_HEADER',
    'SCIT manifest must use schema version 1 and Scout species 1',
  );
  scitAssert(
    Array.isArray(manifest.predecessors) && manifest.predecessors.length <= 4,
    'MANIFEST_PREDECESSORS',
    'SCIT manifest must have at most four direct predecessors',
  );
  for (const [index, predecessor] of manifest.predecessors.entries()) {
    requiredHexDigest(
      predecessor.organismId,
      `predecessor ${index} organism id`,
    );
    requiredHexDigest(predecessor.stateRoot, `predecessor ${index} state root`);
  }
  requireUniquePredecessors(manifest.predecessors);
  requiredHexDigest(manifest.safetyKernelRoot, 'safety-kernel root');
  requiredHexDigest(manifest.constraintsRoot, 'constraints root');
  requiredHexDigest(manifest.moduleSetRoot, 'module-set root');
  if (manifest.publicSkillRoot != null)
    requiredHexDigest(manifest.publicSkillRoot, 'public skill root');
  if (manifest.publicMemoryRoot != null)
    requiredHexDigest(manifest.publicMemoryRoot, 'public-memory root');
  if (manifest.visualRoot != null)
    requiredHexDigest(manifest.visualRoot, 'visual root');
  requiredHexDigest(
    manifest.externalPermissionRoot,
    'external-permission-set root',
  );
  const extensionKeys = Object.keys(manifest.extensions).map(Number);
  for (const key of extensionKeys) {
    scitAssert(
      Number.isSafeInteger(key) && SCIT_REGISTERED_EXTENSION_KEYS.includes(key),
      'MANIFEST_EXTENSION_KEY',
      `SCIT v1 extension key ${key} is not registered`,
    );
    requiredHexDigest(manifest.extensions[key], `extension root ${key}`);
  }

  const expectedCount =
    context.originEvent === 'BIRTH'
      ? 0
      : context.originEvent === 'CHECKPOINT'
        ? 1
        : context.originEvent === 'FUSE'
          ? undefined
          : undefined;
  if (expectedCount != null) {
    scitAssert(
      manifest.predecessors.length === expectedCount,
      'MANIFEST_PREDECESSOR_COUNT',
      `${context.originEvent} manifest must contain ${expectedCount} direct predecessor${expectedCount === 1 ? '' : 's'}`,
    );
  }
  if (context.originEvent === 'FUSE') {
    scitAssert(
      manifest.predecessors.length >= 2 && manifest.predecessors.length <= 4,
      'MANIFEST_PREDECESSOR_COUNT',
      'FUSE manifest must contain two to four direct predecessors',
    );
    for (let index = 1; index < manifest.predecessors.length; index += 1) {
      scitAssert(
        compareHexBytes(
          manifest.predecessors[index - 1].organismId,
          manifest.predecessors[index].organismId,
        ) < 0,
        'MANIFEST_PREDECESSOR_ORDER',
        'FUSE manifest predecessors must be sorted by organism ID',
      );
    }
  }
  if (context.originEvent === 'BIRTH' || context.originEvent === 'FUSE') {
    const zeroRoot = (
      context.zeroPermissionRoot ?? ZERO_PERMISSION_ROOT_HEX
    ).toLowerCase();
    scitAssert(
      manifest.externalPermissionRoot.toLowerCase() === zeroRoot,
      'MANIFEST_PERMISSION_ROOT',
      `${context.originEvent} manifest must use the published zero-permission root`,
    );
  }
  if (context.expectedPredecessors != null) {
    scitAssert(
      samePredecessors(manifest.predecessors, context.expectedPredecessors),
      'MANIFEST_PREDECESSOR_MISMATCH',
      'SCIT manifest predecessor tuples do not match the expected transition',
    );
  }
}

export function stateRootForManifest(
  manifest: ScitManifestV1,
  context: ScitManifestValidationContext = {},
): string {
  return deriveStateRoot(encodeScitManifest(manifest, context)).toString('hex');
}

function nullableRoot(value: string | null, label: string): ScitCborValue {
  return value == null ? null : bytes32FromHex(value, label);
}

function requiredDigest(
  value: ScitCborValue | undefined,
  label: string,
): string {
  scitAssert(
    Buffer.isBuffer(value) && value.length === 32 && !isZeroBytes(value),
    'MANIFEST_DIGEST',
    `${label} must be a nonzero 32-byte byte string`,
  );
  return value.toString('hex');
}

function optionalDigest(
  value: ScitCborValue | undefined,
  label: string,
): string | null {
  if (value === null) return null;
  return requiredDigest(value, label);
}

function requiredHexDigest(value: string, label: string): void {
  const bytes = bytes32FromHex(value, label);
  scitAssert(
    !isZeroBytes(bytes),
    'MANIFEST_DIGEST',
    `${label} must be nonzero; use null for an absent optional root`,
  );
}

function assertExactKeys(
  value: ReadonlyMap<number, ScitCborValue>,
  expected: readonly number[],
): void {
  const actual = [...value.keys()];
  scitAssert(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    'MANIFEST_TOP_LEVEL_KEYS',
    'SCIT v1 manifest must contain exactly top-level keys 0 through 10',
  );
}

function requireUniquePredecessors(
  predecessors: readonly ScitManifestPredecessor[],
): void {
  const ids = new Set<string>();
  for (const predecessor of predecessors) {
    const id = predecessor.organismId.toLowerCase();
    scitAssert(
      !ids.has(id),
      'MANIFEST_DUPLICATE_PREDECESSOR',
      'SCIT manifest predecessor IDs must be unique',
    );
    ids.add(id);
  }
}

function samePredecessors(
  actual: readonly ScitManifestPredecessor[],
  expected: readonly ScitManifestPredecessor[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every(
      (value, index) =>
        value.organismId.toLowerCase() ===
          expected[index].organismId.toLowerCase() &&
        value.stateRoot.toLowerCase() ===
          expected[index].stateRoot.toLowerCase(),
    )
  );
}
