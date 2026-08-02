import { compareBytes, concatBytes, u16be, u32be, u64be } from './scit.bytes';
import { scitAssert } from './scit.errors';

export const SCIT_CBOR_MAX_BYTES = 4096;
export const SCIT_CBOR_MAX_NESTING = 4;

export type ScitCborValue =
  | number
  | bigint
  | Buffer
  | null
  | readonly ScitCborValue[]
  | ReadonlyMap<number, ScitCborValue>;

interface DecodedItem {
  value: ScitCborValue;
  nextOffset: number;
}

interface Header {
  argument: bigint;
  nextOffset: number;
}

export function encodeRestrictedCbor(value: ScitCborValue): Buffer {
  const encoded = encodeItem(value, 0);
  scitAssert(
    encoded.length > 0 && encoded.length <= SCIT_CBOR_MAX_BYTES,
    'CBOR_SIZE',
    `Restricted CBOR must contain between 1 and ${SCIT_CBOR_MAX_BYTES} bytes`,
  );
  return encoded;
}

export function decodeRestrictedCbor(value: Uint8Array): ScitCborValue {
  const bytes = Buffer.from(value);
  scitAssert(
    bytes.length > 0 && bytes.length <= SCIT_CBOR_MAX_BYTES,
    'CBOR_SIZE',
    `Restricted CBOR must contain between 1 and ${SCIT_CBOR_MAX_BYTES} bytes`,
  );
  const decoded = decodeItem(bytes, 0, 0);
  scitAssert(
    decoded.nextOffset === bytes.length,
    'CBOR_TRAILING_BYTES',
    'Restricted CBOR contains trailing bytes',
  );
  const reencoded = encodeRestrictedCbor(decoded.value);
  scitAssert(
    compareBytes(bytes, reencoded) === 0,
    'CBOR_NONCANONICAL',
    'Restricted CBOR does not match its deterministic re-encoding',
  );
  return decoded.value;
}

function encodeItem(value: ScitCborValue, containerDepth: number): Buffer {
  if (value === null) return Buffer.from([0xf6]);
  if (typeof value === 'number' || typeof value === 'bigint') {
    const integer = typeof value === 'bigint' ? value : BigInt(value);
    scitAssert(
      (typeof value === 'bigint' || Number.isSafeInteger(value)) &&
        integer >= 0n &&
        integer <= 0xffff_ffff_ffff_ffffn,
      'CBOR_UNSIGNED_INTEGER',
      'Restricted CBOR integers must be unsigned and no greater than u64',
    );
    return encodeHead(0, integer);
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return concatBytes(encodeHead(2, BigInt(bytes.length)), bytes);
  }
  if (Array.isArray(value)) {
    const nextDepth = containerDepth + 1;
    assertNesting(nextDepth);
    return concatBytes(
      encodeHead(4, BigInt(value.length)),
      ...value.map((item) => encodeItem(item, nextDepth)),
    );
  }
  scitAssert(
    value instanceof Map,
    'CBOR_UNSUPPORTED_TYPE',
    'Restricted CBOR permits only unsigned integers, byte strings, arrays, maps, and null',
  );
  const nextDepth = containerDepth + 1;
  assertNesting(nextDepth);
  const entries = [...value.entries()].sort(([left], [right]) => left - right);
  for (const [key] of entries) {
    scitAssert(
      Number.isSafeInteger(key) && key >= 0,
      'CBOR_MAP_KEY',
      'Restricted CBOR map keys must be unsigned safe integers',
    );
  }
  return concatBytes(
    encodeHead(5, BigInt(entries.length)),
    ...entries.flatMap(([key, entryValue]) => [
      encodeHead(0, BigInt(key)),
      encodeItem(entryValue, nextDepth),
    ]),
  );
}

function decodeItem(
  bytes: Buffer,
  offset: number,
  containerDepth: number,
): DecodedItem {
  scitAssert(
    offset < bytes.length,
    'CBOR_TRUNCATED',
    'Restricted CBOR item is truncated',
  );
  const initial = bytes[offset];
  const major = initial >> 5;
  const additional = initial & 0x1f;

  if (major === 7) {
    scitAssert(
      additional === 22,
      additional === 31 ? 'CBOR_INDEFINITE' : 'CBOR_SIMPLE_VALUE',
      'Restricted CBOR permits null but no booleans, floats, break, or other simple values',
    );
    return { value: null, nextOffset: offset + 1 };
  }
  scitAssert(
    major !== 1,
    'CBOR_NEGATIVE_INTEGER',
    'Restricted CBOR forbids negative integers',
  );
  scitAssert(
    major !== 3,
    'CBOR_TEXT_STRING',
    'Restricted CBOR forbids text strings',
  );
  scitAssert(major !== 6, 'CBOR_TAG', 'Restricted CBOR forbids tags');
  scitAssert(
    major === 0 || major === 2 || major === 4 || major === 5,
    'CBOR_UNSUPPORTED_TYPE',
    'Restricted CBOR contains an unsupported major type',
  );
  const header = decodeHead(bytes, offset, additional);

  if (major === 0) {
    return {
      value: safeNumberOrBigInt(header.argument),
      nextOffset: header.nextOffset,
    };
  }

  const length = lengthAsNumber(header.argument);
  if (major === 2) {
    const end = header.nextOffset + length;
    scitAssert(
      end <= bytes.length,
      'CBOR_TRUNCATED',
      'Restricted CBOR byte string is truncated',
    );
    return {
      value: Buffer.from(bytes.subarray(header.nextOffset, end)),
      nextOffset: end,
    };
  }

  const nextDepth = containerDepth + 1;
  assertNesting(nextDepth);
  if (major === 4) {
    const values: ScitCborValue[] = [];
    let cursor = header.nextOffset;
    for (let index = 0; index < length; index += 1) {
      const decoded = decodeItem(bytes, cursor, nextDepth);
      values.push(decoded.value);
      cursor = decoded.nextOffset;
    }
    return { value: values, nextOffset: cursor };
  }

  const values = new Map<number, ScitCborValue>();
  let cursor = header.nextOffset;
  let previousKey = -1;
  for (let index = 0; index < length; index += 1) {
    scitAssert(
      cursor < bytes.length && bytes[cursor] >> 5 === 0,
      'CBOR_MAP_KEY',
      'Restricted CBOR map keys must be unsigned integers',
    );
    const keyHeader = decodeHead(bytes, cursor, bytes[cursor] & 0x1f);
    const key = lengthAsNumber(keyHeader.argument);
    scitAssert(
      key > previousKey,
      key === previousKey ? 'CBOR_DUPLICATE_KEY' : 'CBOR_MAP_ORDER',
      'Restricted CBOR map keys must be unique and in ascending order',
    );
    const decoded = decodeItem(bytes, keyHeader.nextOffset, nextDepth);
    values.set(key, decoded.value);
    previousKey = key;
    cursor = decoded.nextOffset;
  }
  return { value: values, nextOffset: cursor };
}

function encodeHead(major: number, argument: bigint): Buffer {
  scitAssert(
    argument >= 0n && argument <= 0xffff_ffff_ffff_ffffn,
    'CBOR_ARGUMENT_RANGE',
    'Restricted CBOR argument exceeds u64',
  );
  const prefix = major << 5;
  if (argument < 24n) return Buffer.from([prefix | Number(argument)]);
  if (argument <= 0xffn) return Buffer.from([prefix | 24, Number(argument)]);
  if (argument <= 0xffffn)
    return concatBytes(Buffer.from([prefix | 25]), u16be(Number(argument)));
  if (argument <= 0xffff_ffffn)
    return concatBytes(Buffer.from([prefix | 26]), u32be(Number(argument)));
  return concatBytes(Buffer.from([prefix | 27]), u64be(argument));
}

function decodeHead(bytes: Buffer, offset: number, additional: number): Header {
  scitAssert(
    additional !== 31,
    'CBOR_INDEFINITE',
    'Restricted CBOR forbids indefinite-length items',
  );
  scitAssert(
    additional <= 27,
    'CBOR_RESERVED_ADDITIONAL',
    'Restricted CBOR uses a reserved additional-information value',
  );
  if (additional < 24)
    return { argument: BigInt(additional), nextOffset: offset + 1 };
  const width =
    additional === 24 ? 1 : additional === 25 ? 2 : additional === 26 ? 4 : 8;
  const start = offset + 1;
  const end = start + width;
  scitAssert(
    end <= bytes.length,
    'CBOR_TRUNCATED',
    'Restricted CBOR length or integer is truncated',
  );
  let argument: bigint;
  if (width === 1) argument = BigInt(bytes[start]);
  else if (width === 2) argument = BigInt(bytes.readUInt16BE(start));
  else if (width === 4) argument = BigInt(bytes.readUInt32BE(start));
  else argument = bytes.readBigUInt64BE(start);
  const minimum =
    additional === 24
      ? 24n
      : additional === 25
        ? 0x100n
        : additional === 26
          ? 0x1_0000n
          : 0x1_0000_0000n;
  scitAssert(
    argument >= minimum,
    'CBOR_NONSHORTEST',
    'Restricted CBOR integer or length does not use its shortest form',
  );
  return { argument, nextOffset: end };
}

function lengthAsNumber(value: bigint): number {
  scitAssert(
    value <= BigInt(Number.MAX_SAFE_INTEGER),
    'CBOR_LENGTH_RANGE',
    'Restricted CBOR container or string length exceeds the safe range',
  );
  return Number(value);
}

function safeNumberOrBigInt(value: bigint): number | bigint {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
}

function assertNesting(depth: number): void {
  scitAssert(
    depth <= SCIT_CBOR_MAX_NESTING,
    'CBOR_NESTING',
    `Restricted CBOR nesting must not exceed ${SCIT_CBOR_MAX_NESTING}`,
  );
}
