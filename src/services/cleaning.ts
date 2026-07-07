import type { DropoutDetail, RemovedFrameDetail } from "../types/analysis";
import type { CleanedFrame, DecodedFrame } from "../types/telemetry";
import { computeDropoutThreshold } from "../utils/dropout";
import { mean, median, stdev } from "../utils/stats";

const MAX_SPEED_KMH = 400;
const MAX_RPM = 20000;
const MAX_SPEED_JUMP_KMH = 100;

export type CleanResult = {
  validFrames: CleanedFrame[];
  removedFrames: RemovedFrameDetail[];
  dropouts: DropoutDetail[];
  frameRate: {
    meanMs: number;
    medianMs: number;
    stdevMs: number;
    minMs: number;
    maxMs: number;
  };
};

const EMPTY_FRAME_RATE = {
  meanMs: 0,
  medianMs: 0,
  stdevMs: 0,
  minMs: 0,
  maxMs: 0,
} as const;

type RemovalReason = "spd_exceeds_physical_max" | "rpm_exceeds_physical_max" | "spd_temporal_jump";

function isPhysicallyPlausible(frame: DecodedFrame): RemovalReason | null {
  if (frame.spd > MAX_SPEED_KMH) return "spd_exceeds_physical_max";
  if (frame.rpm > MAX_RPM) return "rpm_exceeds_physical_max";
  return null;
}

function hasTemporalJump(current: DecodedFrame, previous: DecodedFrame): boolean {
  return Math.abs(current.spd - previous.spd) > MAX_SPEED_JUMP_KMH;
}

function buildRemovedDetail(frame: DecodedFrame, reason: RemovalReason): RemovedFrameDetail {
  return {
    ts: frame.ts,
    reason,
    values: { spd: frame.spd, rpm: frame.rpm },
  };
}

function computeFrameRate(intervals: number[]) {
  if (intervals.length === 0) return { ...EMPTY_FRAME_RATE };
  return {
    meanMs: mean(intervals),
    medianMs: median(intervals),
    stdevMs: stdev(intervals),
    minMs: Math.min(...intervals),
    maxMs: Math.max(...intervals),
  };
}

function detectDropouts(validFrames: CleanedFrame[]): DropoutDetail[] {
  if (validFrames.length < 2) return [];

  const intervals: number[] = [];
  for (let i = 1; i < validFrames.length; i++) {
    intervals.push(validFrames[i].ts - validFrames[i - 1].ts);
  }
  const dropoutThreshold = computeDropoutThreshold(intervals);

  const dropouts: DropoutDetail[] = [];
  for (let i = 1; i < validFrames.length; i++) {
    const gap = validFrames[i].ts - validFrames[i - 1].ts;
    if (gap > dropoutThreshold) {
      const before = validFrames[i - 1];
      const after = validFrames[i];
      dropouts.push({
        lap: after.lap,
        tsBefore: before.ts,
        tsAfter: after.ts,
        gapMs: gap,
        posBefore: before.pos,
        posAfter: after.pos,
      });
    }
  }
  return dropouts;
}

export function cleanFrames(frames: DecodedFrame[]): CleanResult {
  if (frames.length === 0) {
    return {
      validFrames: [],
      removedFrames: [],
      dropouts: [],
      frameRate: { ...EMPTY_FRAME_RATE },
    };
  }

  // Defensive sort by ts — recorder should be ordered, but don't assume.
  const sorted = [...frames].sort((a, b) => a.ts - b.ts);

  const validFrames: CleanedFrame[] = [];
  const removedFrames: RemovedFrameDetail[] = [];

  for (const frame of sorted) {
    const boundsViolation = isPhysicallyPlausible(frame);
    if (boundsViolation !== null) {
      removedFrames.push(buildRemovedDetail(frame, boundsViolation));
      continue;
    }

    const lastValid = validFrames[validFrames.length - 1];
    if (lastValid !== undefined && hasTemporalJump(frame, lastValid)) {
      removedFrames.push(buildRemovedDetail(frame, "spd_temporal_jump"));
      continue;
    }

    validFrames.push(frame);
  }

  const intervals: number[] = [];
  for (let i = 1; i < validFrames.length; i++) {
    intervals.push(validFrames[i].ts - validFrames[i - 1].ts);
  }

  return {
    validFrames,
    removedFrames,
    dropouts: detectDropouts(validFrames),
    frameRate: computeFrameRate(intervals),
  };
}
