import { expect, test, describe } from "bun:test";
import { detectCorners } from "../src/services/corners";
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

const RIGHT_CORNER: CornerSpec = { centerPos: 0.3, peakStr: 30, width: 0.05 };
const LEFT_CORNER: CornerSpec = { centerPos: 0.7, peakStr: -30, width: 0.05 };
const FRAME_COUNT = 101;
const INTERVAL_MS = 100;

describe("detectCorners — empty input", () => {
  test("returns empty array for empty input", () => {
    expect(detectCorners([])).toEqual([]);
  });
});

describe("detectCorners — single lap", () => {
  test("detects one right corner in a single lap", () => {
    const lap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const corners = detectCorners([lap]);
    expect(corners).toHaveLength(1);
    expect(corners[0].cornerId).toBe("C1");
    expect(corners[0].direction).toBe("right");
    expect(corners[0].positionRange.apex).toBeCloseTo(0.3, 1);
    expect(corners[0].positionRange.entry).toBeLessThan(
      corners[0].positionRange.apex,
    );
    expect(corners[0].positionRange.exit).toBeGreaterThan(
      corners[0].positionRange.apex,
    );
    expect(corners[0].peakSteeringDeg).toBeCloseTo(30, 0);
    expect(corners[0].consensusStrength).toBeCloseTo(1.0, 5);
    expect(corners[0].confidence).toBe("high");
    expect(corners[0].detectedOnLaps).toEqual([1]);
  });

  test("detects one left corner in a single lap", () => {
    const lap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [LEFT_CORNER]);
    const corners = detectCorners([lap]);
    expect(corners).toHaveLength(1);
    expect(corners[0].direction).toBe("left");
    expect(corners[0].positionRange.apex).toBeCloseTo(0.7, 1);
    expect(corners[0].peakSteeringDeg).toBeCloseTo(30, 0);
  });

  test("detects two corners in a single lap", () => {
    const lap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [
      RIGHT_CORNER,
      LEFT_CORNER,
    ]);
    const corners = detectCorners([lap]);
    expect(corners).toHaveLength(2);
    expect(corners[0].cornerId).toBe("C1");
    expect(corners[0].direction).toBe("right");
    expect(corners[0].positionRange.apex).toBeCloseTo(0.3, 1);
    expect(corners[1].cornerId).toBe("C2");
    expect(corners[1].direction).toBe("left");
    expect(corners[1].positionRange.apex).toBeCloseTo(0.7, 1);
  });

  test("returns empty when no steering is applied", () => {
    const lap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, []);
    expect(detectCorners([lap])).toEqual([]);
  });

  test("returns empty when all steering is below 15° floor", () => {
    const lap = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [
      { centerPos: 0.3, peakStr: 10, width: 0.05 },
    ]);
    expect(detectCorners([lap])).toEqual([]);
  });
});

describe("detectCorners — multiple laps", () => {
  test("detects same corners consistently across multiple laps", () => {
    const corners = [RIGHT_CORNER, LEFT_CORNER];
    const lap1 = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, corners);
    const lap2 = buildLap(2, 11000, FRAME_COUNT, INTERVAL_MS, corners);
    const result = detectCorners([lap1, lap2]);
    expect(result).toHaveLength(2);
    expect(result[0].cornerId).toBe("C1");
    expect(result[0].direction).toBe("right");
    expect(result[0].positionRange.apex).toBeCloseTo(0.3, 1);
    expect(result[0].consensusStrength).toBeCloseTo(1.0, 5);
    expect(result[0].confidence).toBe("high");
    expect(result[0].detectedOnLaps).toEqual([1, 2]);
    expect(result[1].cornerId).toBe("C2");
    expect(result[1].direction).toBe("left");
    expect(result[1].positionRange.apex).toBeCloseTo(0.7, 1);
    expect(result[1].consensusStrength).toBeCloseTo(1.0, 5);
    expect(result[1].confidence).toBe("high");
    expect(result[1].detectedOnLaps).toEqual([1, 2]);
  });

  test("corners are sorted by position with sequential IDs", () => {
    const corners = [RIGHT_CORNER, LEFT_CORNER];
    const lap1 = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, corners);
    const lap2 = buildLap(2, 11000, FRAME_COUNT, INTERVAL_MS, corners);
    const result = detectCorners([lap1, lap2]);
    expect(result.map((c) => c.cornerId)).toEqual(["C1", "C2"]);
    expect(result[0].positionRange.apex).toBeLessThan(
      result[1].positionRange.apex,
    );
  });
});

describe("detectCorners — driver-independent detection", () => {
  test("detects same corner whether driver brakes or goes flat", () => {
    const brakingLap = buildLap(
      1,
      0,
      FRAME_COUNT,
      INTERVAL_MS,
      [RIGHT_CORNER],
      (pos) => {
        if (Math.abs(pos - 0.3) < 0.1) {
          return { brk: 0.5, thr: 0.3 };
        }
        return {};
      },
    );
    const flatLap = buildLap(2, 11000, FRAME_COUNT, INTERVAL_MS, [
      RIGHT_CORNER,
    ]);
    const result = detectCorners([brakingLap, flatLap]);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("right");
    expect(result[0].positionRange.apex).toBeCloseTo(0.3, 1);
    expect(result[0].consensusStrength).toBeCloseTo(1.0, 5);
    expect(result[0].confidence).toBe("high");
    expect(result[0].detectedOnLaps).toEqual([1, 2]);
  });
});

describe("detectCorners — consensus filtering", () => {
  test("filters out corners detected on only 1 of 2 laps", () => {
    const lap1 = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const lap2 = buildLap(2, 11000, FRAME_COUNT, INTERVAL_MS, []);
    const result = detectCorners([lap1, lap2]);
    expect(result).toEqual([]);
  });

  test("assigns medium confidence when corner detected on 2 of 3 laps", () => {
    const lap1 = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const lap2 = buildLap(2, 11000, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const lap3 = buildLap(3, 22000, FRAME_COUNT, INTERVAL_MS, []);
    const result = detectCorners([lap1, lap2, lap3]);
    expect(result).toHaveLength(1);
    expect(result[0].consensusStrength).toBeCloseTo(2 / 3, 2);
    expect(result[0].confidence).toBe("medium");
    expect(result[0].detectedOnLaps).toEqual([1, 2]);
  });

  test("assigns low confidence when corner detected on 2 of 4 laps", () => {
    const lap1 = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const lap2 = buildLap(2, 11000, FRAME_COUNT, INTERVAL_MS, [RIGHT_CORNER]);
    const lap3 = buildLap(3, 22000, FRAME_COUNT, INTERVAL_MS, []);
    const lap4 = buildLap(4, 33000, FRAME_COUNT, INTERVAL_MS, []);
    const result = detectCorners([lap1, lap2, lap3, lap4]);
    expect(result).toHaveLength(1);
    expect(result[0].consensusStrength).toBeCloseTo(0.5, 2);
    expect(result[0].confidence).toBe("low");
  });
});

describe("detectCorners — zone boundaries", () => {
  test("entry is before apex and exit is after apex for all corners", () => {
    const corners = [RIGHT_CORNER, LEFT_CORNER];
    const lap1 = buildLap(1, 0, FRAME_COUNT, INTERVAL_MS, corners);
    const lap2 = buildLap(2, 11000, FRAME_COUNT, INTERVAL_MS, corners);
    const result = detectCorners([lap1, lap2]);
    for (const corner of result) {
      expect(corner.positionRange.entry).toBeLessThan(corner.positionRange.apex);
      expect(corner.positionRange.exit).toBeGreaterThan(
        corner.positionRange.apex,
      );
    }
  });
});