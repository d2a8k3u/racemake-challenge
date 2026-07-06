type PosMagnitude = { pos: number; magnitude: number };

export function findPeaks(
  values: PosMagnitude[],
  threshold: number,
  mergeDistance: number,
): PosMagnitude[] {
  if (values.length < 3) return [];

  const candidates = detectLocalMaxima(values, threshold);
  const merged = mergeNearbyPeaks(candidates, mergeDistance);
  return merged.sort((a, b) => a.pos - b.pos);
}

function detectLocalMaxima(values: PosMagnitude[], threshold: number): PosMagnitude[] {
  const peaks: PosMagnitude[] = [];
  let i = 0;
  while (i < values.length - 1) {
    if (values[i].magnitude <= threshold) {
      i += 1;
      continue;
    }

    let plateauEnd = i;
    const plateauMag = values[i].magnitude;
    while (plateauEnd + 1 < values.length && values[plateauEnd + 1].magnitude === plateauMag) {
      plateauEnd += 1;
    }

    const hasLeftNeighbor = i > 0;
    const hasRightNeighbor = plateauEnd < values.length - 1;
    const isLeftEdgeRising = !hasLeftNeighbor || values[i - 1].magnitude < plateauMag;
    const isRightEdgeFalling = !hasRightNeighbor || values[plateauEnd + 1].magnitude < plateauMag;

    if (hasLeftNeighbor && hasRightNeighbor && isLeftEdgeRising && isRightEdgeFalling) {
      const centerIndex = Math.floor((i + plateauEnd) / 2);
      peaks.push({ pos: values[centerIndex].pos, magnitude: plateauMag });
    }

    i = plateauEnd + 1;
  }
  return peaks;
}

function mergeNearbyPeaks(peaks: PosMagnitude[], mergeDistance: number): PosMagnitude[] {
  if (peaks.length === 0) return [];
  const sorted = [...peaks].sort((a, b) => a.pos - b.pos);

  const merged: PosMagnitude[] = [sorted[0]];
  for (let k = 1; k < sorted.length; k++) {
    const last = merged[merged.length - 1];
    if (sorted[k].pos - last.pos <= mergeDistance) {
      if (sorted[k].magnitude > last.magnitude) {
        merged[merged.length - 1] = sorted[k];
      }
    } else {
      merged.push(sorted[k]);
    }
  }
  return merged;
}
