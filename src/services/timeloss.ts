import type { CleanedFrame } from "../types/telemetry";
import type {
  DetectedCorner,
  CornerDelta,
  CornerMetrics,
  MetricDeltas,
  RootCause,
  RootCauseMetrics,
  TimeLossReport,
} from "../types/analysis";
import { interpolateTimeAtPos } from "../utils/interpolate";
import { guardNaN } from "../utils/math";

const SANITY_TOLERANCE_S = 0.1;
const GAP_THRESHOLD_MS = 500;

type PosTimePair = { pos: number; t: number };

function cumulativeTime(frame: CleanedFrame, lapStartTs: number): number {
  return guardNaN((frame.ts - lapStartTs) / 1000, 0);
}

function buildPosTimePairs(frames: CleanedFrame[]): PosTimePair[] {
  if (frames.length === 0) return [];
  const startTs = frames[0].ts;
  return frames.map((f) => ({
    pos: guardNaN(f.pos, 0),
    t: cumulativeTime(f, startTs),
  }));
}

function timeAtPos(pairs: PosTimePair[], pos: number): number {
  return interpolateTimeAtPos(pairs, pos);
}

function classifySignificance(delta: number): "none" | "low" | "high" {
  const abs = Math.abs(delta);
  if (abs < 0.05) return "none";
  if (abs < 0.1) return "low";
  return "high";
}

function computeCornerDelta(
  corner: DetectedCorner,
  bestPairs: PosTimePair[],
  worstPairs: PosTimePair[],
  bestFrames: CleanedFrame[],
  worstFrames: CleanedFrame[],
): CornerDelta {
  const { entry, apex, exit } = corner.positionRange;

  const bestEntry = timeAtPos(bestPairs, entry);
  const bestApex = timeAtPos(bestPairs, apex);
  const bestExit = timeAtPos(bestPairs, exit);

  const worstEntry = timeAtPos(worstPairs, entry);
  const worstApex = timeAtPos(worstPairs, apex);
  const worstExit = timeAtPos(worstPairs, exit);

  const entryDeltaS =
    (worstApex - worstEntry) - (bestApex - bestEntry);
  const exitDeltaS =
    (worstExit - worstApex) - (bestExit - bestApex);
  const totalDeltaS = entryDeltaS + exitDeltaS;
  const hasGap = detectGapInRange(bestFrames, entry, exit) ||
    detectGapInRange(worstFrames, entry, exit);

  return {
    cornerId: corner.cornerId,
    totalDeltaS,
    entryDeltaS,
    apexDeltaS: 0,
    exitDeltaS,
    isWorstCorner: false,
    significance: classifySignificance(totalDeltaS),
    hasGap,
  };
}

function detectGapInRange(
  frames: CleanedFrame[],
  entryPos: number,
  exitPos: number,
): boolean {
  const inRange = frames.filter(
    (f) => f.pos >= entryPos && f.pos <= exitPos,
  );
  for (let i = 1; i < inRange.length; i++) {
    const gap = inRange[i].ts - inRange[i - 1].ts;
    if (gap > GAP_THRESHOLD_MS) return true;
  }
  return false;
}

function markWorstCorner(deltas: CornerDelta[]): CornerDelta[] {
  if (deltas.length === 0) return deltas;
  let maxAbs = -1;
  let worstIndex = 0;
  for (let i = 0; i < deltas.length; i++) {
    const abs = Math.abs(deltas[i].totalDeltaS);
    if (abs > maxAbs) {
      maxAbs = abs;
      worstIndex = i;
    }
  }
  return deltas.map((cd, i) => ({
    ...cd,
    isWorstCorner: i === worstIndex,
  }));
}

function extractCornerFrames(
  frames: CleanedFrame[],
  corner: DetectedCorner,
): CleanedFrame[] {
  const { entry, exit } = corner.positionRange;
  return frames.filter(
    (f) => f.pos >= entry && f.pos <= exit,
  );
}

function computeCornerMetrics(frames: CleanedFrame[]): CornerMetrics {
  if (frames.length === 0) {
    return {
      minSpeedKmh: 0,
      maxBrake: 0,
      minThrottle: 0,
      maxSteeringDeg: 0,
      minGear: 0,
      tyreTempEntryC: { fl: 0, fr: 0, rl: 0, rr: 0 },
    };
  }

  const speeds = frames.map((f) => guardNaN(f.spd, 0));
  const brakes = frames.map((f) => guardNaN(f.brk, 0));
  const throttles = frames.map((f) => guardNaN(f.thr, 0));
  const steering = frames.map((f) => Math.abs(guardNaN(f.str, 0)));
  const gears = frames.map((f) => guardNaN(f.gear, 0));

  return {
    minSpeedKmh: Math.min(...speeds),
    maxBrake: Math.max(...brakes),
    minThrottle: Math.min(...throttles),
    maxSteeringDeg: Math.max(...steering),
    minGear: Math.min(...gears),
    tyreTempEntryC: { ...frames[0].tyres },
  };
}

function computeMetricDeltas(
  best: CornerMetrics,
  worst: CornerMetrics,
): MetricDeltas {
  return {
    speedDeltaKmh: worst.minSpeedKmh - best.minSpeedKmh,
    brakeDelta: worst.maxBrake - best.maxBrake,
    throttleDelta: worst.minThrottle - best.minThrottle,
    steeringDeltaDeg: worst.maxSteeringDeg - best.maxSteeringDeg,
    gearDelta: worst.minGear - best.minGear,
    tyreTempDeltaC: {
      fl: worst.tyreTempEntryC.fl - best.tyreTempEntryC.fl,
      fr: worst.tyreTempEntryC.fr - best.tyreTempEntryC.fr,
      rl: worst.tyreTempEntryC.rl - best.tyreTempEntryC.rl,
      rr: worst.tyreTempEntryC.rr - best.tyreTempEntryC.rr,
    },
  };
}

function buildExplanation(
  corner: DetectedCorner,
  totalDeltaS: number,
  deltas: MetricDeltas,
  worst: CornerMetrics,
  best: CornerMetrics,
): string {
  const speedComparison = deltas.speedDeltaKmh < 0
    ? `Worst lap was ${Math.abs(deltas.speedDeltaKmh).toFixed(1)} km/h slower at minimum`
    : `Worst lap was ${deltas.speedDeltaKmh.toFixed(1)} km/h faster at minimum (unexpected)`;

  const brakeComparison = deltas.brakeDelta > 0.01
    ? `Worst lap braked harder (+${deltas.brakeDelta.toFixed(2)})`
    : deltas.brakeDelta < -0.01
    ? `Worst lap braked less (${deltas.brakeDelta.toFixed(2)})`
    : `Brake input similar (${deltas.brakeDelta.toFixed(2)})`;

  const tyreDelta = (deltas.tyreTempDeltaC.fl +
    deltas.tyreTempDeltaC.fr +
    deltas.tyreTempDeltaC.rl +
    deltas.tyreTempDeltaC.rr) / 4;
  const tyreComparison = Math.abs(tyreDelta) > 1
    ? `Tyre temps avg ${tyreDelta > 0 ? "+" : ""}${tyreDelta.toFixed(1)}°C on worst lap`
    : `Tyre temps similar (${tyreDelta.toFixed(1)}°C avg)`;

  return `At ${corner.cornerId} (${corner.direction} at pos ${corner.positionRange.apex.toFixed(4)}), ${totalDeltaS.toFixed(3)}s lost. ${speedComparison}. ${brakeComparison}. ${tyreComparison}.`;
}

function buildRootCause(
  corner: DetectedCorner,
  totalDeltaS: number,
  bestFrames: CleanedFrame[],
  worstFrames: CleanedFrame[],
): RootCause {
  const bestMetrics = computeCornerMetrics(
    extractCornerFrames(bestFrames, corner),
  );
  const worstMetrics = computeCornerMetrics(
    extractCornerFrames(worstFrames, corner),
  );
  const deltas = computeMetricDeltas(bestMetrics, worstMetrics);
  const explanation = buildExplanation(
    corner,
    totalDeltaS,
    deltas,
    worstMetrics,
    bestMetrics,
  );

  const metrics: RootCauseMetrics = {
    bestLap: bestMetrics,
    worstLap: worstMetrics,
    deltas,
  };

  return {
    cornerId: corner.cornerId,
    metrics,
    explanation,
  };
}

export function analyzeTimeLoss(
  bestLapFrames: CleanedFrame[],
  worstLapFrames: CleanedFrame[],
  corners: DetectedCorner[],
): TimeLossReport {
  const bestPairs = buildPosTimePairs(bestLapFrames);
  const worstPairs = buildPosTimePairs(worstLapFrames);

  const bestLapTimeS = bestPairs.length > 0
    ? bestPairs[bestPairs.length - 1].t
    : 0;
  const worstLapTimeS = worstPairs.length > 0
    ? worstPairs[worstPairs.length - 1].t
    : 0;

  const bestLap = bestLapFrames.length > 0 ? bestLapFrames[0].lap : 0;
  const worstLap = worstLapFrames.length > 0 ? worstLapFrames[0].lap : 0;

  const rawCornerDeltas = corners.map((corner) =>
    computeCornerDelta(
      corner,
      bestPairs,
      worstPairs,
      bestLapFrames,
      worstLapFrames,
    ),
  );
  const cornerDeltas = markWorstCorner(rawCornerDeltas);

  const sumOfCornerDeltasS = cornerDeltas.reduce(
    (acc, cd) => acc + cd.totalDeltaS,
    0,
  );

  // Total delta is computed from final positions to reflect the actual lap time
  // difference. The grid-point average would only be valid if both laps spanned
  // the exact same pos range; using the end-of-lap cumulative times is more
  // robust against laps that start/end at slightly different positions.
  const totalDeltaS = worstLapTimeS - bestLapTimeS;

  const sanityCheck = {
    sumOfCornerDeltasS,
    totalDeltaS,
    passed: Math.abs(sumOfCornerDeltasS - totalDeltaS) < SANITY_TOLERANCE_S,
  };

  const worstCornerDelta = cornerDeltas.find((cd) => cd.isWorstCorner);
  let rootCause: RootCause;
  if (worstCornerDelta && corners.length > 0) {
    const worstCorner = corners.find((c) =>
      c.cornerId === worstCornerDelta.cornerId
    )!;
    rootCause = buildRootCause(
      worstCorner,
      worstCornerDelta.totalDeltaS,
      bestLapFrames,
      worstLapFrames,
    );
  } else {
    rootCause = {
      cornerId: "",
      metrics: {
        bestLap: computeCornerMetrics([]),
        worstLap: computeCornerMetrics([]),
        deltas: computeMetricDeltas(
          computeCornerMetrics([]),
          computeCornerMetrics([]),
        ),
      },
      explanation: "No corners detected; unable to localize time loss.",
    };
  }

  return {
    bestLap,
    worstLap,
    bestLapTimeS,
    worstLapTimeS,
    totalDeltaS,
    cornerDeltas,
    rootCause,
    sanityCheck,
  };
}