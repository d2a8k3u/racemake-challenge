import { median } from "./stats";

const DROPOUT_GAP_FLOOR_MS = 500;
const DROPOUT_GAP_MEDIAN_MULTIPLIER = 5;

export function computeDropoutThreshold(intervals: number[]): number {
  if (intervals.length === 0) return DROPOUT_GAP_FLOOR_MS;
  const medianInterval = median(intervals);
  return Math.max(DROPOUT_GAP_FLOOR_MS, DROPOUT_GAP_MEDIAN_MULTIPLIER * medianInterval);
}
