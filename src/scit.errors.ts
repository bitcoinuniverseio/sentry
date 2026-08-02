export class ScitProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ScitProtocolError';
  }
}

export function scitAssert(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new ScitProtocolError(code, message);
}
