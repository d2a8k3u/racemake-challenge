import { describe, expect, test } from "bun:test";
import { cleanFrames } from "../src/services/cleaning";
import type { DecodedFrame } from "../src/types/telemetry";

function makeFrame(overrides: Partial<DecodedFrame> = {}): DecodedFrame {
  return {
    ts: 0,
    lap: 1,
    pos: 0,
    spd: 200,
    thr: 0.5,
    brk: 0,
    str: 0,
    gear: 3,
    rpm: 6000,
    tyres: { fl: 80, fr: 80, rl: 80, rr: 80 },
    ...overrides,
  };
}

function makeFrames(
  count: number,
  opts: { startTs?: number; intervalMs?: number; spd?: number; rpm?: number; lap?: number } = {},
): DecodedFrame[] {
  const { startTs = 0, intervalMs = 50, spd = 200, rpm = 6000, lap = 1 } = opts;
  return Array.from({ length: count }, (_, i) =>
    makeFrame({ ts: startTs + i * intervalMs, pos: i, spd, rpm, lap }),
  );
}

describe("cleanFrames — empty input", () => {
  test("returns empty arrays and zero frameRate for empty input", () => {
    const result = cleanFrames([]);
    expect(result.validFrames).toEqual([]);
    expect(result.removedFrames).toEqual([]);
    expect(result.dropouts).toEqual([]);
    expect(result.frameRate).toEqual({
      meanMs: 0,
      medianMs: 0,
      stdevMs: 0,
      minMs: 0,
      maxMs: 0,
    });
  });
});

describe("cleanFrames — single frame", () => {
  test("returns the single frame as valid with no removals or dropouts", () => {
    const frame = makeFrame({ ts: 100, spd: 200, rpm: 6000 });
    const result = cleanFrames([frame]);
    expect(result.validFrames).toHaveLength(1);
    expect(result.validFrames[0]).toEqual(frame);
    expect(result.removedFrames).toEqual([]);
    expect(result.dropouts).toEqual([]);
    expect(result.frameRate).toEqual({
      meanMs: 0,
      medianMs: 0,
      stdevMs: 0,
      minMs: 0,
      maxMs: 0,
    });
  });
});

describe("cleanFrames — physical bounds removal", () => {
  test("removes frame with spd > 400 (garbage frame with spd=4021)", () => {
    const frames = [
      makeFrame({ ts: 0, spd: 200 }),
      makeFrame({ ts: 50, spd: 4021 }),
      makeFrame({ ts: 100, spd: 210 }),
    ];
    const result = cleanFrames(frames);
    expect(result.validFrames).toHaveLength(2);
    expect(result.validFrames.map((f) => f.spd)).toEqual([200, 210]);
    expect(result.removedFrames).toHaveLength(1);
    expect(result.removedFrames[0].ts).toBe(50);
    expect(result.removedFrames[0].reason).toBe("spd_exceeds_physical_max");
    expect(result.removedFrames[0].values.spd).toBe(4021);
  });

  test("removes frame with rpm > 20000", () => {
    const frames = [
      makeFrame({ ts: 0, rpm: 6000 }),
      makeFrame({ ts: 50, rpm: 25000 }),
      makeFrame({ ts: 100, rpm: 7000 }),
    ];
    const result = cleanFrames(frames);
    expect(result.validFrames).toHaveLength(2);
    expect(result.removedFrames).toHaveLength(1);
    expect(result.removedFrames[0].reason).toBe("rpm_exceeds_physical_max");
    expect(result.removedFrames[0].values.rpm).toBe(25000);
  });

  test("removes frame with spd exactly at 400 (boundary not exceeded)", () => {
    const _frames = [makeFrame({ ts: 0, spd: 400 })];
    const result = cleanFrames([makeFrame({ ts: 0, spd: 400 })]);
    expect(result.validFrames).toHaveLength(1);
  });

  test("removes frame with rpm exactly at 20000 (boundary not exceeded)", () => {
    const result = cleanFrames([makeFrame({ ts: 0, rpm: 20000 })]);
    expect(result.validFrames).toHaveLength(1);
  });

  test("removes all corrupted frames when every frame is out of bounds", () => {
    const frames = [
      makeFrame({ ts: 0, spd: 4021 }),
      makeFrame({ ts: 50, rpm: 25000 }),
      makeFrame({ ts: 100, spd: 500 }),
    ];
    const result = cleanFrames(frames);
    expect(result.validFrames).toEqual([]);
    expect(result.removedFrames).toHaveLength(3);
  });
});

describe("cleanFrames — temporal consistency", () => {
  test("removes frame with speed jump > 100 km/h from previous valid frame", () => {
    const frames = [
      makeFrame({ ts: 0, spd: 200 }),
      makeFrame({ ts: 50, spd: 320 }),
      makeFrame({ ts: 100, spd: 205 }),
    ];
    const result = cleanFrames(frames);
    expect(result.validFrames).toHaveLength(2);
    expect(result.validFrames.map((f) => f.spd)).toEqual([200, 205]);
    expect(result.removedFrames).toHaveLength(1);
    expect(result.removedFrames[0].reason).toBe("spd_temporal_jump");
  });

  test("does not remove frame with speed jump exactly 100 km/h", () => {
    const frames = [makeFrame({ ts: 0, spd: 200 }), makeFrame({ ts: 50, spd: 300 })];
    const result = cleanFrames(frames);
    expect(result.validFrames).toHaveLength(2);
  });

  test("compares against previous valid frame, not raw predecessor", () => {
    const frames = [
      makeFrame({ ts: 0, spd: 200 }),
      makeFrame({ ts: 50, spd: 4021 }),
      makeFrame({ ts: 100, spd: 250 }),
      makeFrame({ ts: 150, spd: 220 }),
    ];
    const result = cleanFrames(frames);
    expect(result.validFrames.map((f) => f.spd)).toEqual([200, 250, 220]);
    expect(result.removedFrames).toHaveLength(1);
  });
});

describe("cleanFrames — dropout detection", () => {
  test("detects dropout when gap exceeds 500ms", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0 }),
      makeFrame({ ts: 50, lap: 1, pos: 1 }),
      makeFrame({ ts: 600, lap: 1, pos: 2 }),
      makeFrame({ ts: 650, lap: 1, pos: 3 }),
    ];
    const result = cleanFrames(frames);
    expect(result.dropouts).toHaveLength(1);
    const dropout = result.dropouts[0];
    expect(dropout.lap).toBe(1);
    expect(dropout.tsBefore).toBe(50);
    expect(dropout.tsAfter).toBe(600);
    expect(dropout.gapMs).toBe(550);
    expect(dropout.posBefore).toBe(1);
    expect(dropout.posAfter).toBe(2);
  });

  test("detects dropout when gap exceeds 5x median interval (above 500ms floor)", () => {
    const frames = makeFrames(6, { intervalMs: 200, startTs: 0 });
    frames.push(makeFrame({ ts: 2200, lap: 1, pos: 6 }));
    const result = cleanFrames(frames);
    expect(result.dropouts).toHaveLength(1);
    expect(result.dropouts[0].gapMs).toBe(1200);
  });

  test("does not flag gap below 5x median even if above 500ms", () => {
    const frames = makeFrames(6, { intervalMs: 200, startTs: 0 });
    frames.push(makeFrame({ ts: 1700, lap: 1, pos: 6 }));
    const result = cleanFrames(frames);
    expect(result.dropouts).toHaveLength(0);
  });

  test("does not flag a dropout when gap is within normal range", () => {
    const frames = makeFrames(10, { intervalMs: 50, startTs: 0 });
    const result = cleanFrames(frames);
    expect(result.dropouts).toEqual([]);
  });

  test("detects multiple dropouts", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0 }),
      makeFrame({ ts: 50, lap: 1, pos: 1 }),
      makeFrame({ ts: 600, lap: 1, pos: 2 }),
      makeFrame({ ts: 650, lap: 1, pos: 3 }),
      makeFrame({ ts: 1300, lap: 2, pos: 4 }),
      makeFrame({ ts: 1350, lap: 2, pos: 5 }),
    ];
    const result = cleanFrames(frames);
    expect(result.dropouts).toHaveLength(2);
    expect(result.dropouts[0].lap).toBe(1);
    expect(result.dropouts[1].lap).toBe(2);
  });

  test("does not detect dropout when only one frame is valid", () => {
    const result = cleanFrames([makeFrame({ ts: 0 })]);
    expect(result.dropouts).toEqual([]);
  });
});

describe("cleanFrames — frame rate stats", () => {
  test("computes mean, median, stdev, min, max for regular intervals", () => {
    const frames = makeFrames(6, { intervalMs: 50, startTs: 0 });
    const result = cleanFrames(frames);
    expect(result.frameRate.meanMs).toBeCloseTo(50, 5);
    expect(result.frameRate.medianMs).toBeCloseTo(50, 5);
    expect(result.frameRate.stdevMs).toBeCloseTo(0, 5);
    expect(result.frameRate.minMs).toBe(50);
    expect(result.frameRate.maxMs).toBe(50);
  });

  test("computes stats for irregular intervals", () => {
    const frames = [
      makeFrame({ ts: 0, pos: 0 }),
      makeFrame({ ts: 40, pos: 1 }),
      makeFrame({ ts: 100, pos: 2 }),
      makeFrame({ ts: 150, pos: 3 }),
    ];
    const result = cleanFrames(frames);
    const _intervals = [40, 60, 50];
    expect(result.frameRate.meanMs).toBeCloseTo(50, 5);
    expect(result.frameRate.medianMs).toBeCloseTo(50, 5);
    expect(result.frameRate.minMs).toBe(40);
    expect(result.frameRate.maxMs).toBe(60);
  });

  test("returns zero frameRate for empty input", () => {
    const result = cleanFrames([]);
    expect(result.frameRate).toEqual({
      meanMs: 0,
      medianMs: 0,
      stdevMs: 0,
      minMs: 0,
      maxMs: 0,
    });
  });

  test("returns zero frameRate for single frame", () => {
    const result = cleanFrames([makeFrame({ ts: 0 })]);
    expect(result.frameRate).toEqual({
      meanMs: 0,
      medianMs: 0,
      stdevMs: 0,
      minMs: 0,
      maxMs: 0,
    });
  });
});

describe("cleanFrames — no dropouts", () => {
  test("returns empty dropouts array when no gaps exceed threshold", () => {
    const frames = makeFrames(20, { intervalMs: 50, startTs: 0 });
    const result = cleanFrames(frames);
    expect(result.dropouts).toEqual([]);
    expect(result.validFrames).toHaveLength(20);
  });
});

describe("cleanFrames — real sample data", () => {
  test("cleans a realistic stint with mixed valid and garbage frames", () => {
    const frames: DecodedFrame[] = [
      makeFrame({ ts: 0, lap: 1, pos: 0, spd: 120, rpm: 4000 }),
      makeFrame({ ts: 50, lap: 1, pos: 1, spd: 125, rpm: 4200 }),
      makeFrame({ ts: 100, lap: 1, pos: 2, spd: 4021, rpm: 8000 }),
      makeFrame({ ts: 150, lap: 1, pos: 3, spd: 130, rpm: 4300 }),
      makeFrame({ ts: 200, lap: 1, pos: 4, spd: 128, rpm: 4100 }),
      makeFrame({ ts: 250, lap: 1, pos: 5, spd: 132, rpm: 4400 }),
      makeFrame({ ts: 900, lap: 1, pos: 6, spd: 135, rpm: 4500 }),
      makeFrame({ ts: 950, lap: 1, pos: 7, spd: 138, rpm: 4600 }),
    ];
    const result = cleanFrames(frames);

    expect(result.validFrames).toHaveLength(7);
    expect(result.validFrames.map((f) => f.spd)).not.toContain(4021);

    expect(result.removedFrames).toHaveLength(1);
    expect(result.removedFrames[0].ts).toBe(100);
    expect(result.removedFrames[0].reason).toBe("spd_exceeds_physical_max");

    expect(result.dropouts).toHaveLength(1);
    expect(result.dropouts[0].tsBefore).toBe(250);
    expect(result.dropouts[0].tsAfter).toBe(900);
    expect(result.dropouts[0].gapMs).toBe(650);

    expect(result.frameRate.meanMs).toBeGreaterThan(0);
  });

  test("keeps all frames in a clean, consistent stint", () => {
    const frames = makeFrames(50, { intervalMs: 50, startTs: 1000, spd: 180, rpm: 7000 });
    const result = cleanFrames(frames);
    expect(result.validFrames).toHaveLength(50);
    expect(result.removedFrames).toEqual([]);
    expect(result.dropouts).toEqual([]);
    expect(result.frameRate.meanMs).toBeCloseTo(50, 5);
    expect(result.frameRate.medianMs).toBeCloseTo(50, 5);
  });
});
