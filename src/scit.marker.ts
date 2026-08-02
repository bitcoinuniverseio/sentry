import {
  bytes32FromHex,
  bytesFromHex,
  isZeroBytes,
  readU16be,
  u16be,
} from './scit.bytes';
import { scitAssert } from './scit.errors';

export const SCIT_MARKER_SCRIPT_BYTES = 76;
export const SCIT_MARKER_PAYLOAD_BYTES = 74;
export const SCIT_MARKER_MAGIC = Buffer.from('SCIT', 'ascii');
export const SCIT_WIRE_VERSION = 1;

export const SCIT_EVENT_CODES = Object.freeze({
  BIRTH: 0x01,
  TRANSFER: 0x02,
  CHECKPOINT: 0x03,
  FUSE: 0x04,
  RETIRE: 0x05,
} as const);

export type ScitEventType = keyof typeof SCIT_EVENT_CODES;

const EVENT_BY_CODE = new Map<number, ScitEventType>(
  Object.entries(SCIT_EVENT_CODES).map(([name, code]) => [
    code,
    name as ScitEventType,
  ]),
);

export interface ScitMarker {
  version: 1;
  eventType: ScitEventType;
  flags: 0;
  organismId: string;
  stateRoot: string;
  carrierVout: 1 | 0xffff;
}

export interface ScitMarkerInput {
  eventType: ScitEventType;
  organismId: string;
  stateRoot: string;
}

export function encodeScitMarker(input: ScitMarkerInput): Buffer {
  const eventCode = SCIT_EVENT_CODES[input.eventType];
  scitAssert(
    eventCode != null,
    'MARKER_UNKNOWN_EVENT',
    'SCIT event type is not registered in wire version 1',
  );
  const organismId = bytes32FromHex(input.organismId, 'organism id');
  const stateRoot = bytes32FromHex(input.stateRoot, 'state root');
  scitAssert(
    !isZeroBytes(organismId),
    'MARKER_ZERO_ORGANISM_ID',
    'SCIT organism ID must be nonzero',
  );
  scitAssert(
    !isZeroBytes(stateRoot),
    'MARKER_ZERO_STATE_ROOT',
    'SCIT state root must be nonzero',
  );
  const carrierVout = input.eventType === 'RETIRE' ? 0xffff : 1;
  const payload = Buffer.concat([
    SCIT_MARKER_MAGIC,
    Buffer.from([SCIT_WIRE_VERSION, eventCode]),
    u16be(0),
    organismId,
    stateRoot,
    u16be(carrierVout),
  ]);
  scitAssert(
    payload.length === SCIT_MARKER_PAYLOAD_BYTES,
    'MARKER_INTERNAL_LENGTH',
    'SCIT marker payload has an unexpected internal length',
  );
  return Buffer.concat([Buffer.from([0x6a, 0x4a]), payload]);
}

export function decodeScitMarker(script: Uint8Array | string): ScitMarker {
  const bytes =
    typeof script === 'string'
      ? bytesFromHex(script, 'marker script')
      : Buffer.from(script);
  scitAssert(
    bytes.length >= 2,
    'MARKER_LENGTH',
    'SCIT marker script is truncated before its push opcode',
  );
  scitAssert(
    bytes[0] === 0x6a,
    'MARKER_NOT_OP_RETURN',
    'SCIT marker must begin with OP_RETURN',
  );
  scitAssert(
    bytes[1] === 0x4a,
    'MARKER_NON_DIRECT_PUSH',
    'SCIT marker must use the direct 74-byte push opcode',
  );
  scitAssert(
    bytes.length === SCIT_MARKER_SCRIPT_BYTES,
    'MARKER_LENGTH',
    `SCIT marker script must be exactly ${SCIT_MARKER_SCRIPT_BYTES} bytes`,
  );
  const payload = bytes.subarray(2);
  scitAssert(
    payload.subarray(0, 4).equals(SCIT_MARKER_MAGIC),
    'MARKER_MAGIC',
    'SCIT marker magic is invalid',
  );
  scitAssert(
    payload[4] === SCIT_WIRE_VERSION,
    'MARKER_VERSION',
    'SCIT marker wire version is not supported',
  );
  const eventType = EVENT_BY_CODE.get(payload[5]);
  scitAssert(
    eventType != null,
    'MARKER_UNKNOWN_EVENT',
    'SCIT marker event type is not registered',
  );
  const flags = readU16be(payload, 6);
  scitAssert(
    flags === 0,
    'MARKER_RESERVED_FLAGS',
    'SCIT/1 marker flags must be zero',
  );
  const organismId = payload.subarray(8, 40);
  const stateRoot = payload.subarray(40, 72);
  scitAssert(
    !isZeroBytes(organismId),
    'MARKER_ZERO_ORGANISM_ID',
    'SCIT organism ID must be nonzero',
  );
  scitAssert(
    !isZeroBytes(stateRoot),
    'MARKER_ZERO_STATE_ROOT',
    'SCIT state root must be nonzero',
  );
  const carrierVout = readU16be(payload, 72);
  const expectedVout = eventType === 'RETIRE' ? 0xffff : 1;
  scitAssert(
    carrierVout === expectedVout,
    'MARKER_CARRIER_VOUT',
    eventType === 'RETIRE'
      ? 'RETIRE marker carrier_vout must be 0xffff'
      : `${eventType} marker carrier_vout must be 0x0001`,
  );
  return {
    version: 1,
    eventType,
    flags: 0,
    organismId: Buffer.from(organismId).toString('hex'),
    stateRoot: Buffer.from(stateRoot).toString('hex'),
    carrierVout: carrierVout as 1 | 0xffff,
  };
}

export function tryDecodeScitMarker(
  script: Uint8Array | string,
):
  | { ok: true; marker: ScitMarker }
  | { ok: false; code: string; reason: string } {
  try {
    return { ok: true, marker: decodeScitMarker(script) };
  } catch (error: unknown) {
    return {
      ok: false,
      code:
        error != null &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'MARKER_INVALID',
      reason: error instanceof Error ? error.message : 'Invalid SCIT marker',
    };
  }
}
