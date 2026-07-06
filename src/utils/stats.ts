import { isFiniteNumber } from "./math";

function finiteOnly(values: number[]): number[] {
  return values.filter(isFiniteNumber);
}

export function mean(values: number[]): number {
  const finite = finiteOnly(values);
  if (finite.length === 0) return 0;
  return finite.reduce((sum, v) => sum + v, 0) / finite.length;
}

export function median(values: number[]): number {
  const finite = finiteOnly(values);
  if (finite.length === 0) return 0;
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function stdev(values: number[]): number {
  const finite = finiteOnly(values);
  if (finite.length < 2) return 0;
  const m = finite.reduce((sum, v) => sum + v, 0) / finite.length;
  const variance =
    finite.reduce((sum, v) => sum + (v - m) ** 2, 0) / (finite.length - 1);
  return Math.sqrt(variance);
}

export function movingAverage(values: number[], window: number): number[] {
  if (values.length === 0) return [];
  const halfLeft = Math.floor((window - 1) / 2);
  const halfRight = Math.floor(window / 2);
  return values.map((_, i) => {
    const start = Math.max(0, i - halfLeft);
    const end = Math.min(values.length, i + halfRight + 1);
    const slice = finiteOnly(values.slice(start, end));
    if (slice.length === 0) return 0;
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}

export function quantile(values: number[], q: number): number {
  const finite = finiteOnly(values);
  if (finite.length === 0) return 0;
  const clampedQ = Math.min(1, Math.max(0, q));
  const sorted = [...finite].sort((a, b) => a - b);
  const pos = clampedQ * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

export function mad(values: number[]): number {
  const finite = finiteOnly(values);
  if (finite.length === 0) return 0;
  const med = median(finite);
  const deviations = finite.map((v) => Math.abs(v - med));
  return median(deviations);
}