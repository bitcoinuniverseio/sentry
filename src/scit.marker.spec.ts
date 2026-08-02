import { ScitProtocolError } from './scit.errors';
import {
  decodeScitMarker,
  encodeScitMarker,
  SCIT_EVENT_CODES,
  type ScitEventType,
} from './scit.marker';
import { SCIT_MARKER_VECTOR } from './scit.vectors';

const ID = '11'.repeat(32);
const ROOT = '22'.repeat(32);

describe('SCIT/1 marker codec', () => {
  it('matches the exact 76-byte BIRTH conformance vector', () => {
    const script = encodeScitMarker({
      eventType: 'BIRTH',
      organismId: ID,
      stateRoot: ROOT,
    });
    expect(script).toHaveLength(76);
    expect(script.toString('hex')).toBe(SCIT_MARKER_VECTOR.scriptHex);
    expect(decodeScitMarker(script)).toEqual({
      version: 1,
      eventType: 'BIRTH',
      flags: 0,
      organismId: ID,
      stateRoot: ROOT,
      carrierVout: 1,
    });
  });

  it.each(Object.keys(SCIT_EVENT_CODES) as ScitEventType[])(
    'round trips %s with the event-specific carrier vout',
    (eventType) => {
      const marker = decodeScitMarker(
        encodeScitMarker({ eventType, organismId: ID, stateRoot: ROOT }),
      );
      expect(marker.eventType).toBe(eventType);
      expect(marker.carrierVout).toBe(eventType === 'RETIRE' ? 0xffff : 1);
    },
  );

  it.each([
    [
      'MARKER_NON_DIRECT_PUSH',
      `6a4c4a${SCIT_MARKER_VECTOR.scriptHex.slice(4)}`,
    ],
    ['MARKER_LENGTH', SCIT_MARKER_VECTOR.scriptHex.slice(0, -2)],
    ['MARKER_LENGTH', `${SCIT_MARKER_VECTOR.scriptHex}00`],
    ['MARKER_MAGIC', replaceByte(SCIT_MARKER_VECTOR.scriptHex, 2, 0x00)],
    ['MARKER_VERSION', replaceByte(SCIT_MARKER_VECTOR.scriptHex, 6, 0x02)],
    [
      'MARKER_UNKNOWN_EVENT',
      replaceByte(SCIT_MARKER_VECTOR.scriptHex, 7, 0x06),
    ],
    [
      'MARKER_RESERVED_FLAGS',
      replaceByte(SCIT_MARKER_VECTOR.scriptHex, 8, 0x01),
    ],
    [
      'MARKER_ZERO_ORGANISM_ID',
      zeroRange(SCIT_MARKER_VECTOR.scriptHex, 10, 32),
    ],
    ['MARKER_ZERO_STATE_ROOT', zeroRange(SCIT_MARKER_VECTOR.scriptHex, 42, 32)],
    [
      'MARKER_CARRIER_VOUT',
      replaceByte(SCIT_MARKER_VECTOR.scriptHex, 75, 0x02),
    ],
  ])('rejects malformed marker with %s', (code, scriptHex) => {
    expectProtocolCode(() => decodeScitMarker(scriptHex), code);
  });
});

function expectProtocolCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected SCIT protocol failure');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ScitProtocolError);
    expect((error as ScitProtocolError).code).toBe(code);
  }
}

function replaceByte(hex: string, byteOffset: number, value: number): string {
  return `${hex.slice(0, byteOffset * 2)}${value.toString(16).padStart(2, '0')}${hex.slice(byteOffset * 2 + 2)}`;
}

function zeroRange(
  hex: string,
  byteOffset: number,
  byteLength: number,
): string {
  return `${hex.slice(0, byteOffset * 2)}${'00'.repeat(byteLength)}${hex.slice((byteOffset + byteLength) * 2)}`;
}
