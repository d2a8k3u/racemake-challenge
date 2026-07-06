import type { CleanedFrame } from "../types/telemetry";
import type { LapReport } from "../types/analysis";
import { guardNaN } from "../utils/math";
import { median } from "../utils/stats";

const DROPOUT_GAP_FLOOR_MS = 500;
const DROPOUT_GAP_MEDIAN_MULTIPLIER = 5;
const OUT_LAP_POS_START_MIN = 0.1;
const IN_LAP_POS_END_MAX = 0.9;
const IN_LAP_FINAL_SPEED_MAX_KMH = 5;
const INVALID_LAP_INDEX = -1;

type LapClassification = "full" | "out-lap" | "in-lap";

function groupByLap(frames: CleanedFrame[]): Map<number, CleanedFrame[]> {
  const groups = new Map<number, CleanedFrame[]>();
  for (const frame of frames) {
    let group = groups.get(frame.lap);
    if (group === undefined) {
      group = [];
      groups.set(frame.lap, group);
    }
    group.push(frame);
  }
  return groups;
}

function classifyLap(posStart: number, posEnd: number, finalSpeed: number): LapClassification {
  if (posStart > OUT_LAP_POS_START_MIN) return "out-lap";
  if (posEnd < IN_LAP_POS_END_MAX || finalSpeed < IN_LAP_FINAL_SPEED_MAX_KMH) {
    return "in-lap";
  }
  return "full";
}

function isFullRacingClassification(classification: LapClassification): boolean {
  return classification === "full";
}

function computeDropoutThreshold(lapFrames: CleanedFrame[]): number {
  if (lapFrames.length < 2) return DROPOUT_GAP_FLOOR_MS;
  const intervals: number[] = [];
  for (let i = 1; i < lapFrames.length; i++) {
    intervals.push(lapFrames[i].ts - lapFrames[i - 1].ts);
  }
  const medianInterval = median(intervals);
  return Math.max(DROPOUT_GAP_FLOOR_MS, DROPOUT_GAP_MEDIAN_MULTIPLIER * medianInterval);
}

function sumDropoutGapsWithinLap(lapFrames: CleanedFrame[]): number {
  if (lapFrames.length < 2) return 0;
  const threshold = computeDropoutThreshold(lapFrames);
  let totalDropoutMs = 0;
  for (let i = 1; i < lapFrames.length; i++) {
    const gap = lapFrames[i].ts - lapFrames[i - 1].ts;
    if (gap > threshold) {
      totalDropoutMs += gap;
    }
  }
  return totalDropoutMs;
}

function buildLapReport(lapNumber: number, lapFrames: CleanedFrame[]): LapReport {
  const first = lapFrames[0];
  const last = lapFrames[lapFrames.length - 1];
  const posStart = guardNaN(first.pos, 0);
  const posEnd = guardNaN(last.pos, 0);
  const finalSpeed = guardNaN(last.spd, 0);

  const classification = classifyLap(posStart, posEnd, finalSpeed);
  const rawLapTimeMs = last.ts - first.ts;

  const dropoutMs = sumDropoutGapsWithinLap(lapFrames);
  const adjustedLapTimeMs = rawLapTimeMs - dropoutMs;

  return {
    lapNumber,
    classification,
    frames: lapFrames.length,
    posStart,
    posEnd,
    rawLapTimeMs,
    adjustedLapTimeMs,
    adjustedLapTimeS: adjustedLapTimeMs / 1000,
    hasDropout: dropoutMs > 0,
    dropoutMs,
    isFullRacingLap: isFullRacingClassification(classification),
  };
}

export function detectLaps(frames: CleanedFrame[]): LapReport[] {
  if (frames.length === 0) return [];

  const groups = groupByLap(frames);
  const lapReports: LapReport[] = [];

  for (const [lapNumber, lapFrames] of groups) {
    lapReports.push(buildLapReport(lapNumber, lapFrames));
  }

  return lapReports;
}

export function selectBestAndWorstLaps(laps: LapReport[]): {
  bestLap: number;
  worstLap: number;
} {
  const fullRacingLaps = laps.filter((lap) => lap.isFullRacingLap);
  if (fullRacingLaps.length === 0) {
    return { bestLap: INVALID_LAP_INDEX, worstLap: INVALID_LAP_INDEX };
  }

  if (fullRacingLaps.length === 1) {
    const onlyLap = fullRacingLaps[0].lapNumber;
    return { bestLap: onlyLap, worstLap: onlyLap };
  }

  // Worst lap is the slowest by raw (wall-clock) time, regardless of dropout.
  // Dropout inflates adjusted time; ranking worst by adjusted time would make a
  // dropout-heavy lap look "faster" and wrongly crown it worst. Raw time is the
  // true measure of how long the lap actually took.
  const slowestLap = fullRacingLaps.reduce((max, lap) =>
    lap.rawLapTimeMs > max.rawLapTimeMs ? lap : max,
  );

  const cleanFullLaps = fullRacingLaps.filter((lap) => !lap.hasDropout);
  const bestPool = cleanFullLaps.length > 0 ? cleanFullLaps : fullRacingLaps;

  const fastestLap = bestPool.reduce((min, lap) =>
    lap.adjustedLapTimeMs < min.adjustedLapTimeMs ? lap : min,
  );

  return { bestLap: fastestLap.lapNumber, worstLap: slowestLap.lapNumber };
}