import type { DetectedCorner } from "../types/analysis";
import type { CleanedFrame } from "../types/telemetry";
import { guardNaN, safeDiv } from "../utils/math";
import { findPeaks } from "../utils/peakdetect";
import { mean, median, movingAverage, stdev } from "../utils/stats";

const SMOOTHING_WINDOW = 7;
const PEAK_MERGE_DISTANCE = 0.02;
const CONSENSUS_CLUSTER_DISTANCE = 0.03;
const ZONE_FRACTION = 0.3;

const STRAIGHT_STEERING_MAX = 5;
const STRAIGHT_BRAKE_MAX = 0.05;
const STRAIGHT_THROTTLE_MIN = 0.9;

// Any sustained steering > 15° at racing speed is cornering.
// Below this, drivers make micro-corrections that aren't corners.
const PHYSICAL_STEERING_FLOOR = 15;

const STRAIGHT_THRESHOLD_STDEV_MULTIPLIER = 20;

const CONFIDENCE_HIGH = 1.0;
const CONFIDENCE_MEDIUM = 0.6;

type LapPeak = {
  pos: number;
  magnitude: number;
  lap: number;
};

function isStraightFrame(frame: CleanedFrame): boolean {
  return (
    Math.abs(frame.str) < STRAIGHT_STEERING_MAX &&
    frame.brk < STRAIGHT_BRAKE_MAX &&
    frame.thr > STRAIGHT_THROTTLE_MIN
  );
}

function computeAdaptiveThreshold(frames: CleanedFrame[]): number {
  const straightFrames = frames.filter(isStraightFrame);
  const straightAbsStr = straightFrames.map((f) => Math.abs(f.str));
  const straightMedian = median(straightAbsStr);
  const straightStdevVal = stdev(straightAbsStr);
  return Math.max(
    PHYSICAL_STEERING_FLOOR,
    straightMedian + STRAIGHT_THRESHOLD_STDEV_MULTIPLIER * straightStdevVal,
  );
}

function extractLapPeaks(lap: CleanedFrame[], lapNumber: number): LapPeak[] {
  if (lap.length === 0) return [];

  const absStr = lap.map((f) => Math.abs(guardNaN(f.str, 0)));
  const smoothed = movingAverage(absStr, SMOOTHING_WINDOW);
  const threshold = computeAdaptiveThreshold(lap);

  const posMagnitude = lap.map((f, i) => ({
    pos: guardNaN(f.pos, 0),
    magnitude: smoothed[i],
  }));

  const peaks = findPeaks(posMagnitude, threshold, PEAK_MERGE_DISTANCE);

  return peaks.map((p) => ({
    pos: p.pos,
    magnitude: p.magnitude,
    lap: lapNumber,
  }));
}

function clusterPeaksByPosition(peaks: LapPeak[], clusterDistance: number): LapPeak[][] {
  if (peaks.length === 0) return [];
  const sorted = [...peaks].sort((a, b) => a.pos - b.pos);
  const clusters: LapPeak[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const currentCluster = clusters[clusters.length - 1];
    const clusterCenter = mean(currentCluster.map((p) => p.pos));
    if (sorted[i].pos - clusterCenter <= clusterDistance) {
      currentCluster.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }
  return clusters;
}

function findFrameIndexNearPos(frames: CleanedFrame[], targetPos: number): number {
  let nearestIndex = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const dist = Math.abs(frames[i].pos - targetPos);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIndex = i;
    }
  }
  return nearestIndex;
}

function findZoneBoundary(
  absStr: number[],
  apexIndex: number,
  direction: "backward" | "forward",
  threshold: number,
): number {
  if (direction === "backward") {
    for (let i = apexIndex; i >= 0; i--) {
      if (absStr[i] < threshold) return i + 1;
    }
    return 0;
  }
  for (let i = apexIndex; i < absStr.length; i++) {
    if (absStr[i] < threshold) return i - 1;
  }
  return absStr.length - 1;
}

function computeDirection(cluster: LapPeak[], lapFrames: CleanedFrame[]): "left" | "right" {
  const apexPos = mean(cluster.map((p) => p.pos));
  const apexIndex = findFrameIndexNearPos(lapFrames, apexPos);
  const apexStr = guardNaN(lapFrames[apexIndex].str, 0);
  return apexStr >= 0 ? "right" : "left";
}

function computePeakSteeringDeg(cluster: LapPeak[], lapFrames: CleanedFrame[]): number {
  const apexPos = mean(cluster.map((p) => p.pos));
  let maxAbsStr = 0;
  for (const frame of lapFrames) {
    const dist = Math.abs(frame.pos - apexPos);
    if (dist > CONSENSUS_CLUSTER_DISTANCE) continue;
    const absStr = Math.abs(guardNaN(frame.str, 0));
    if (absStr > maxAbsStr) maxAbsStr = absStr;
  }
  return maxAbsStr > 0 ? maxAbsStr : Math.max(...cluster.map((p) => p.magnitude));
}

function computeZoneBoundaries(
  apexPos: number,
  peakAbsStr: number,
  representativeLap: CleanedFrame[],
): { entry: number; exit: number } {
  const absStr = representativeLap.map((f) => Math.abs(guardNaN(f.str, 0)));
  const apexIndex = findFrameIndexNearPos(representativeLap, apexPos);
  const zoneThreshold = ZONE_FRACTION * peakAbsStr;

  let entryIndex = findZoneBoundary(absStr, apexIndex, "backward", zoneThreshold);
  let exitIndex = findZoneBoundary(absStr, apexIndex, "forward", zoneThreshold);

  entryIndex = Math.max(0, Math.min(entryIndex, apexIndex));
  exitIndex = Math.max(apexIndex, Math.min(exitIndex, absStr.length - 1));

  const entryPos = representativeLap[Math.min(entryIndex, representativeLap.length - 1)].pos;
  const exitPos = representativeLap[Math.min(exitIndex, representativeLap.length - 1)].pos;

  return {
    entry: guardNaN(entryPos, 0),
    exit: guardNaN(exitPos, apexPos),
  };
}

function classifyConfidence(consensusStrength: number): "high" | "medium" | "low" {
  if (consensusStrength >= CONFIDENCE_HIGH) return "high";
  if (consensusStrength >= CONFIDENCE_MEDIUM) return "medium";
  return "low";
}

function buildConsensusCorners(
  clusters: LapPeak[][],
  totalLaps: number,
  representativeLap: CleanedFrame[],
): DetectedCorner[] {
  return clusters
    .map((cluster) => {
      const detectedOnLaps = [...new Set(cluster.map((p) => p.lap))].sort((a, b) => a - b);
      const shouldKeep = totalLaps === 1 || detectedOnLaps.length >= 2;
      if (!shouldKeep) return null;

      const apexPos = mean(cluster.map((p) => p.pos));
      const consensusStrength = safeDiv(detectedOnLaps.length, totalLaps, 0);
      const direction = computeDirection(cluster, representativeLap);
      const peakSteeringDeg = computePeakSteeringDeg(cluster, representativeLap);
      const zones = computeZoneBoundaries(apexPos, peakSteeringDeg, representativeLap);

      return {
        cornerId: "",
        positionRange: {
          entry: zones.entry,
          apex: apexPos,
          exit: zones.exit,
        },
        direction,
        peakSteeringDeg,
        consensusStrength,
        detectedOnLaps,
        confidence: classifyConfidence(consensusStrength),
      };
    })
    .filter((c): c is DetectedCorner => c !== null)
    .sort((a, b) => a.positionRange.apex - b.positionRange.apex)
    .map((corner, index) => ({
      ...corner,
      cornerId: `C${index + 1}`,
    }));
}

export function detectCorners(fullLapFrames: CleanedFrame[][]): DetectedCorner[] {
  if (fullLapFrames.length === 0) return [];
  const nonEmptyLaps = fullLapFrames.filter((lap) => lap.length > 0);
  if (nonEmptyLaps.length === 0) return [];

  const allPeaks: LapPeak[] = [];
  for (let lapIndex = 0; lapIndex < nonEmptyLaps.length; lapIndex++) {
    const lapPeaks = extractLapPeaks(nonEmptyLaps[lapIndex], lapIndex + 1);
    allPeaks.push(...lapPeaks);
  }

  if (allPeaks.length === 0) return [];

  const representativeLap = nonEmptyLaps[0];
  const totalLaps = nonEmptyLaps.length;

  if (totalLaps === 1) {
    const singleLapClusters = allPeaks.map((p) => [p]);
    return buildConsensusCorners(singleLapClusters, totalLaps, representativeLap);
  }

  const clusters = clusterPeaksByPosition(allPeaks, CONSENSUS_CLUSTER_DISTANCE);
  return buildConsensusCorners(clusters, totalLaps, representativeLap);
}
