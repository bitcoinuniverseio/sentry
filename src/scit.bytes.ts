import { scitAssert } from './scit.errors';

const HEX_PATTERN = /^(?:[0-9a-fA-F]{2})+$/;

export function bytesFromHex(
  value: string,
  label = 'hex value',
  expectedBytes?: number,
): Buffer {
  scitAssert(
    typeof value === 'string' && value.length > 0 && HEX_PATTERN.test(value),
    'INVALID_HEX',
    `${label} must be non-empty, even-length hexadecimal`,
  );
  const bytes = Buffer.from(value, 'hex');
  scitAssert(
    expectedBytes == null || bytes.length === expectedBytes,
    'INVALID_BYTE_LENGTH',
    `${label} must be exactly ${expectedBytes} bytes`,
  );
  return bytes;
}

export function bytes32FromHex(value: string, label: string): Buffer {
  return bytesFromHex(value, label, 32);
}

export function displayHashBytes(value: string, label: string): Buffer {
  return bytes32FromHex(value, label);
}

export function isZeroBytes(value: Uint8Array): boolean {
  return value.every((byte) => byte === 0);
}

export function u8be(value: number): Buffer {
  assertUnsignedInteger(value, 0xff, 'u8');
  return Buffer.from([value]);
}

export function u16be(value: number): Buffer {
  assertUnsignedInteger(value, 0xffff, 'u16');
  const bytes = Buffer.allocUnsafe(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

export function u32be(value: number): Buffer {
  assertUnsignedInteger(value, 0xffffffff, 'u32');
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

export function u64be(value: number | bigint): Buffer {
  const integer = typeof value === 'bigint' ? value : BigInt(value);
  scitAssert(
    integer >= 0n && integer <= 0xffff_ffff_ffff_ffffn,
    'INVALID_UNSIGNED_INTEGER',
    'u64 must be between zero and 2^64 - 1',
  );
  if (typeof value === 'number') {
    scitAssert(
      Number.isSafeInteger(value),
      'INVALID_UNSIGNED_INTEGER',
      'u64 number input must be a safe integer; use bigint otherwise',
    );
  }
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(integer);
  return bytes;
}

export function readU16be(value: Uint8Array, offset = 0): number {
  scitAssert(
    offset >= 0 && offset + 2 <= value.length,
    'TRUNCATED_INTEGER',
    'u16 read exceeds the available bytes',
  );
  return Buffer.from(value).readUInt16BE(offset);
}

export function compareBytes(left: Uint8Array, right: Uint8Array): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export function compareHexBytes(left: string, right: string): number {
  return compareBytes(bytesFromHex(left), bytesFromHex(right));
}

export function concatBytes(...values: readonly Uint8Array[]): Buffer {
  return Buffer.concat(values.map((value) => Buffer.from(value)));
}

export function outpointDisplayBytes(outpoint: {
  txid: string;
  vout: number;
}): Buffer {
  return concatBytes(
    displayHashBytes(outpoint.txid, 'outpoint txid'),
    u32be(outpoint.vout),
  );
}

export function normalizeHex(value: Uint8Array | string): string {
  return typeof value === 'string'
    ? bytesFromHex(value).toString('hex')
    : Buffer.from(value).toString('hex');
}

function assertUnsignedInteger(
  value: number,
  maximum: number,
  label: string,
): void {
  scitAssert(
    Number.isSafeInteger(value) && value >= 0 && value <= maximum,
    'INVALID_UNSIGNED_INTEGER',
    `${label} must be an unsigned integer no greater than ${maximum}`,
  );
}
