import { describe, expect, test } from "bun:test";
import { detectCorners } from "../src/services/corners";
import { analyzeTimeLoss } from "../src/services/timeloss";
import type { DetectedCorner } from "../src/types/analysis";
import type { CleanedFrame } from "../src/types/telemetry";

function makeFrame(overrides: Partial<CleanedFrame> = {}): CleanedFrame {
  return {
    ts: 0,
    lap: 1,
    pos: 0,
    spd: 200,
    thr: 0.95,
    brk: 0,
    str: 0,
    gear: 3,
    rpm: 6000,
    tyres: { fl: 80, fr: 80, rl: 80, rr: 80 },
    ...overrides,
  };
}

type CornerSpec = { centerPos: number; peakStr: number; width: number };

function buildLap(
  lapNumber: number,
  startTs: number,
  frameCount: number,
  intervalMs: number,
  corners: CornerSpec[] = [],
  perFrameOverrides: (pos: number) => Partial<CleanedFrame> = () => ({}),
): CleanedFrame[] {
  return Array.from({ length: frameCount }, (_, i) => {
    const pos = i / (frameCount - 1);
    let str = 0;
    for (const c of corners) {
      const dist = Math.abs(pos - c.centerPos);
      if (dist < c.width) {
        str += c.peakStr * (1 - dist / c.width);
      }
    }
    return makeFrame({
      lap: lapNumber,
      ts: startTs + i * intervalMs,
      pos,
      str,
      ...perFrameOverrides(pos),
    });
  });
}

function buildLapWithSlowCorner(
  lapNumber: number,
  startTs: number,
  frameCount: number,
  intervalMs: number,
  cornerCenter: number,
  cornerWidth: number,
  slowIntervalMs: number,
): CleanedFrame[] {
  const frames: CleanedFrame[] = [];
  let ts = startTs;
  for (let i = 0; i < frameCount; i++) {
    const pos = i / (frameCount - 1);
    const dist = Math.abs(pos - cornerCenter);
    const inSlowZone = dist < cornerWidth;
    const localInterval = inSlowZone
      ? intervalMs + (slowIntervalMs - intervalMs) * (1 - dist / cornerWidth)
      : intervalMs;
    frames.push(
      makeFrame({
        lap: lapNumber,
        ts: Math.round(ts),
        pos,
        str: inSlowZone ? 30 * (1 - dist / cornerWidth) : 0,
        spd: inSlowZone ? 120 : 200,
      }),
    );
    if (i < frameCount - 1) {
      ts += localInterval;
    }
  }
  return frames;
}

function buildSlowLapWithGap(
  lapNumber: number,
  startTs: number,
  frameCount: number,
  intervalMs: number,
  cornerCenter: number,
  cornerWidth: number,
  gapPos: number,
  gapMs: number,
): CleanedFrame[] {
  const frames: CleanedFrame[] = [];
  let ts = startTs;
  for (let i = 0; i < frameCount; i++) {
    const pos = i / (frameCount - 1);
    if (i > 0 && Math.abs((i - 1) / (frameCount - 1) - gapPos) < 0.001) {
      ts += gapMs;
    }
    const dist = Math.abs(pos - cornerCenter);
    const inCorner = dist < cornerWidth;
    const localInterval = inCorner ? intervalMs * 1.5 : intervalMs;
    frames.push(
      makeFrame({
        lap: lapNumber,
        ts: Math.round(ts),
        pos,
        str: inCorner ? 30 * (1 - dist / cornerWidth) : 0,
        spd: inCorner ? 120 : 200,
      }),
    );
    if (i < frameCount - 1) {
      ts += localInterval;
    }
  }
  return frames;
}

const RIGHT_CORNER: CornerSpec = { centerPos: 0.3, peakStr: 30, width: 0.05 };
const FRAME_COUNT = 101;
const INTERVAL_MS = 100;

function detectCornersForLaps(laps: CleanedFrame[][]): DetectedCorner[] {
  return detectCorners(laps);
}

describe("analyzeTimeLoss — simple synthetic data", () => {
  test("returns report with total delta matching synthetic time loss", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    expect(corners.length).toBeGreaterThanOrEqual(1);

    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    expect(report.bestLap).toBe(1);
    expect(report.worstLap).toBe(2);
    expect(report.totalDeltaS).toBeGreaterThan(0);
    expect(report.cornerDeltas).toHaveLength(corners.length);
    expect(report.sanityCheck).toBeDefined();
    expect(report.sanityCheck.passed).toBe(true);
  });

  test("attributes time loss to the slow corner, not elsewhere", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    const slowCorner = report.cornerDeltas.find((c) => c.isWorstCorner);
    expect(slowCorner).toBeDefined();
    expect(slowCorner?.totalDeltaS).toBeGreaterThan(0.05);
    expect(slowCorner?.significance).not.toBe("none");
  });

  test("best lap time equals the cumulative time at pos=1.0 for the best lap", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLap(2, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    const expectedBestTimeS = (bestLap[bestLap.length - 1].ts - bestLap[0].ts) / 1000;
    expect(report.bestLapTimeS).toBeCloseTo(expectedBestTimeS, 1);
  });
});

describe("analyzeTimeLoss — edge cases", () => {
  test("identical laps produce zero total delta", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLap(2, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    expect(report.totalDeltaS).toBeCloseTo(0, 2);
    for (const cd of report.cornerDeltas) {
      expect(Math.abs(cd.totalDeltaS)).toBeLessThan(0.05);
      expect(cd.significance).toBe("none");
    }
    expect(report.sanityCheck.passed).toBe(true);
  });

  test("empty corners array produces empty cornerDeltas", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS);
    const worstLap = buildLap(2, 0, FRAME_COUNT, INTERVAL_MS);
    const report = analyzeTimeLoss(bestLap, worstLap, []);

    expect(report.cornerDeltas).toEqual([]);
    expect(report.sanityCheck.sumOfCornerDeltasS).toBe(0);
    expect(report.sanityCheck.passed).toBe(true);
  });

  test("single corner produces single cornerDelta with isWorstCorner true", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    expect(report.cornerDeltas).toHaveLength(1);
    expect(report.cornerDeltas[0].isWorstCorner).toBe(true);
  });

  test("empty best lap frames does not crash", () => {
    const bestLap: CleanedFrame[] = [];
    const worstLap = buildLap(2, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const corners = detectCornersForLaps([worstLap]);
    expect(() => analyzeTimeLoss(bestLap, worstLap, corners)).not.toThrow();
  });

  test("empty worst lap frames does not crash", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap: CleanedFrame[] = [];
    const corners = detectCornersForLaps([bestLap]);
    expect(() => analyzeTimeLoss(bestLap, worstLap, corners)).not.toThrow();
  });
});

describe("analyzeTimeLoss — sanity check", () => {
  test("sanity check passes when corner deltas sum within 0.1s of total delta", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    expect(report.sanityCheck.passed).toBe(true);
    const diff = Math.abs(report.sanityCheck.sumOfCornerDeltasS - report.sanityCheck.totalDeltaS);
    expect(diff).toBeLessThan(0.1);
  });

  test("sanity check sum equals sum of corner totalDeltaS", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    const manualSum = report.cornerDeltas.reduce((acc, c) => acc + c.totalDeltaS, 0);
    expect(report.sanityCheck.sumOfCornerDeltasS).toBeCloseTo(manualSum, 5);
  });
});

describe("analyzeTimeLoss — root cause", () => {
  test("root cause references the worst corner and contains explanation", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    const worstCorner = report.cornerDeltas.find((c) => c.isWorstCorner);
    expect(worstCorner).toBeDefined();
    expect(report.rootCause.cornerId).toBe(worstCorner?.cornerId);
    expect(report.rootCause.explanation.length).toBeGreaterThan(0);
    expect(report.rootCause.metrics.bestLap).toBeDefined();
    expect(report.rootCause.metrics.worstLap).toBeDefined();
    expect(report.rootCause.metrics.deltas).toBeDefined();
  });

  test("root cause deltas are worst minus best", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    expect(report.rootCause.metrics.deltas.speedDeltaKmh).toBeLessThan(0);
  });

  test("root cause explanation mentions corner id and direction", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    expect(report.rootCause.explanation).toContain(report.rootCause.cornerId);
  });
});

describe("analyzeTimeLoss — corner phase deltas", () => {
  test("apexDelta equals entryDelta + exitDelta or is zero-based segment", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    for (const cd of report.cornerDeltas) {
      expect(cd.entryDeltaS).toBeDefined();
      expect(cd.exitDeltaS).toBeDefined();
      expect(cd.apexDeltaS).toBeDefined();
      const phases = cd.entryDeltaS + cd.exitDeltaS;
      expect(cd.totalDeltaS).toBeCloseTo(phases, 2);
    }
  });

  test("significance is none when delta is below 0.05s", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLap(2, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    for (const cd of report.cornerDeltas) {
      expect(cd.significance).toBe("none");
    }
  });

  test("significance is high when delta is >= 0.1s", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 200);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    const worst = report.cornerDeltas.find((c) => c.isWorstCorner);
    expect(worst).toBeDefined();
    expect(worst?.significance).toBe("high");
  });
});

describe("analyzeTimeLoss — gap detection", () => {
  test("hasGap is true when a frame gap > 500ms exists in the corner pos range", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildSlowLapWithGap(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 0.3, 800);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    const worstCorner = report.cornerDeltas.find((c) => c.isWorstCorner);
    expect(worstCorner).toBeDefined();
    expect(worstCorner?.hasGap).toBe(true);
  });

  test("hasGap is false when no gaps > 500ms exist in corner range", () => {
    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.3, 0.05, 150);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    for (const cd of report.cornerDeltas) {
      expect(cd.hasGap).toBe(false);
    }
  });
});

describe("analyzeTimeLoss — real sample data comparison", () => {
  test("produces a valid report from two laps with multiple corners", () => {
    const cornerA: CornerSpec = { centerPos: 0.2, peakStr: 30, width: 0.04 };
    const cornerB: CornerSpec = { centerPos: 0.55, peakStr: -25, width: 0.05 };
    const cornerC: CornerSpec = { centerPos: 0.8, peakStr: 35, width: 0.04 };

    const bestLap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [cornerA, cornerB, cornerC]);
    const worstLap = buildLapWithSlowCorner(2, 0, FRAME_COUNT, INTERVAL_MS, 0.55, 0.05, 160);
    const corners = detectCornersForLaps([bestLap, worstLap]);
    expect(corners.length).toBeGreaterThanOrEqual(1);

    const report = analyzeTimeLoss(bestLap, worstLap, corners);

    expect(report.totalDeltaS).toBeGreaterThan(0);
    expect(report.cornerDeltas.length).toBe(corners.length);
    expect(report.sanityCheck.passed).toBe(true);

    const worst = report.cornerDeltas.find((c) => c.isWorstCorner);
    expect(worst).toBeDefined();
    expect(worst?.totalDeltaS).toBeGreaterThan(0);
  });
});
