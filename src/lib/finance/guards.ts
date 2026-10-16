/**
 * Runtime guards shared by the engine (internal, not re-exported).
 *
 * User input is validated by forms and Zod schemas before it reaches the
 * engine, so an invalid argument here is a programming error: the engine
 * throws a RangeError instead of returning a plausible but wrong number.
 */

/** Readable form of a received value for error messages; never throws. */
export function show(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    // Circular structures and BigInt fields cannot be serialized.
    return Object.prototype.toString.call(value);
  }
}

export function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `${label} must be a finite number (received ${show(value)})`,
    );
  }
}

export function assertAtLeast(value: number, min: number, label: string): void {
  if (!Number.isFinite(value) || value < min) {
    throw new RangeError(
      `${label} must be a finite number >= ${min} (received ${show(value)})`,
    );
  }
}

export function assertInteger(
  value: number,
  label: string,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(
      `${label} must be an integer from ${min} to ${max} (received ${show(value)})`,
    );
  }
}

/** Rates are decimals (0.01 = 1%) and must stay above −100%. */
export function assertRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= -1) {
    throw new RangeError(
      `${label} must be a finite rate greater than -1 (received ${show(value)})`,
    );
  }
}

export function assertOneOf<T extends string>(
  value: T,
  allowed: readonly T[],
  label: string,
): void {
  if (!allowed.includes(value)) {
    throw new RangeError(
      `${label} must be one of ${allowed.join(", ")} (received ${show(value)})`,
    );
  }
}
