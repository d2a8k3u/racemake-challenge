export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return fallback;
  }
  if (denominator === 0) return fallback;
  return numerator / denominator;
}

export function guardNaN(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function safeSqrt(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.sqrt(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
