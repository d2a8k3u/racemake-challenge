import { safeDiv } from "./math";

export function linearInterpolate(
  x: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  if (x0 === x1) return y0;
  const fraction = safeDiv(x - x0, x1 - x0);
  return y0 + fraction * (y1 - y0);
}

export function resampleToPosGrid(
  frames: { pos: number; value: number }[],
  gridPoints: number,
): number[] {
  if (gridPoints <= 0) return [];
  if (frames.length === 0) {
    return Array.from({ length: gridPoints }, () => 0);
  }

  const sorted = [...frames].sort((a, b) => a.pos - b.pos);

  if (sorted.length === 1) {
    return Array.from({ length: gridPoints }, () => sorted[0].value);
  }

  const result: number[] = [];
  for (let i = 0; i < gridPoints; i++) {
    const targetPos = gridPoints === 1 ? sorted[0].pos : i / (gridPoints - 1);
    result.push(sampleAt(sorted, targetPos));
  }
  return result;
}

function sampleAt(sorted: { pos: number; value: number }[], targetPos: number): number {
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (targetPos <= first.pos) return first.value;
  if (targetPos >= last.pos) return last.value;

  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (sorted[mid].pos < targetPos) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const left = sorted[lo];
  const right = sorted[hi];
  return linearInterpolate(targetPos, left.pos, left.value, right.pos, right.value);
}

export function interpolateTimeAtPos(
  frames: { pos: number; t: number }[],
  targetPos: number,
): number {
  if (frames.length === 0) return 0;

  const sorted = [...frames].sort((a, b) => a.pos - b.pos);

  if (targetPos <= sorted[0].pos) {
    return targetPos < sorted[0].pos ? 0 : sorted[0].t;
  }
  if (targetPos >= sorted[sorted.length - 1].pos) {
    return sorted[sorted.length - 1].t;
  }

  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (sorted[mid].pos < targetPos) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const left = sorted[lo];
  const right = sorted[hi];
  return linearInterpolate(targetPos, left.pos, left.t, right.pos, right.t);
}
