import { decodeRestrictedCbor } from './scit.cbor';
import { ScitProtocolError } from './scit.errors';
import {
  decodeScitManifest,
  encodeScitManifest,
  stateRootForManifest,
  ZERO_PERMISSION_ROOT_HEX,
  type ScitManifestV1,
} from './scit.manifest';

describe('SCIT/1 restricted deterministic CBOR manifest', () => {
  it('round trips an exact birth manifest and computes a stable state root', () => {
    const manifest = sampleManifest([]);
    const bytes = encodeScitManifest(manifest, { originEvent: 'BIRTH' });
    const decoded = decodeScitManifest(bytes, { originEvent: 'BIRTH' });
    expect(decoded.manifest).toEqual(manifest);
    expect(decoded.stateRoot).toBe(
      stateRootForManifest(manifest, { originEvent: 'BIRTH' }),
    );
    expect(bytes.length).toBeLessThanOrEqual(4096);
  });

  it.each([
    ['CBOR_NONSHORTEST', 'a1180001'],
    ['CBOR_INDEFINITE', '9fff'],
    ['CBOR_TEXT_STRING', '6161'],
    ['CBOR_DUPLICATE_KEY', 'a200010002'],
    ['CBOR_MAP_ORDER', 'a201010001'],
    ['CBOR_NESTING', '818181818100'],
  ])('rejects nonconforming restricted CBOR with %s', (code, hex) => {
    expectProtocolCode(
      () => decodeRestrictedCbor(Buffer.from(hex, 'hex')),
      code,
    );
  });

  it('rejects payloads above 4 KiB', () => {
    expectProtocolCode(
      () => decodeRestrictedCbor(Buffer.alloc(4097, 0)),
      'CBOR_SIZE',
    );
  });

  it('enforces event-specific predecessors and zero permissions', () => {
    const predecessor = {
      organismId: 'a1'.repeat(32),
      stateRoot: 'b1'.repeat(32),
    };
    expect(() =>
      encodeScitManifest(sampleManifest([predecessor]), {
        originEvent: 'CHECKPOINT',
        expectedPredecessors: [predecessor],
      }),
    ).not.toThrow();
    expectProtocolCode(
      () =>
        encodeScitManifest(sampleManifest([predecessor]), {
          originEvent: 'BIRTH',
        }),
      'MANIFEST_PREDECESSOR_COUNT',
    );
    expectProtocolCode(
      () =>
        encodeScitManifest(
          { ...sampleManifest([]), externalPermissionRoot: 'cc'.repeat(32) },
          { originEvent: 'BIRTH' },
        ),
      'MANIFEST_PERMISSION_ROOT',
    );
  });

  it('enforces sorted fusion parents and registered extension roots', () => {
    const high = { organismId: 'f1'.repeat(32), stateRoot: '31'.repeat(32) };
    const low = { organismId: '01'.repeat(32), stateRoot: '32'.repeat(32) };
    expectProtocolCode(
      () =>
        encodeScitManifest(sampleManifest([high, low]), {
          originEvent: 'FUSE',
        }),
      'MANIFEST_PREDECESSOR_ORDER',
    );
    expectProtocolCode(
      () =>
        encodeScitManifest(
          { ...sampleManifest([]), extensions: { 5: '44'.repeat(32) } },
          { originEvent: 'BIRTH' },
        ),
      'MANIFEST_EXTENSION_KEY',
    );
  });

  it('requires null, rather than an all-zero optional digest', () => {
    expectProtocolCode(
      () =>
        encodeScitManifest(
          { ...sampleManifest([]), publicSkillRoot: '00'.repeat(32) },
          { originEvent: 'BIRTH' },
        ),
      'MANIFEST_DIGEST',
    );
  });
});

function sampleManifest(
  predecessors: ScitManifestV1['predecessors'],
): ScitManifestV1 {
  return {
    schemaVersion: 1,
    species: 1,
    predecessors,
    safetyKernelRoot: '11'.repeat(32),
    constraintsRoot: '22'.repeat(32),
    moduleSetRoot: '33'.repeat(32),
    publicSkillRoot: null,
    publicMemoryRoot: null,
    visualRoot: null,
    externalPermissionRoot: ZERO_PERMISSION_ROOT_HEX,
    extensions: { 0: '44'.repeat(32) },
  };
}

function expectProtocolCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected SCIT protocol failure');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ScitProtocolError);
    expect((error as ScitProtocolError).code).toBe(code);
  }
}
