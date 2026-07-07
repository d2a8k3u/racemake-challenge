import type { CleanedFrame } from "../types/telemetry";

export function framesForLap(frames: CleanedFrame[], lapNumber: number): CleanedFrame[] {
  return frames.filter((frame) => frame.lap === lapNumber);
}
