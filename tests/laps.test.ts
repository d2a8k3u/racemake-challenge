import { describe, expect, test } from "bun:test";
import { detectLaps, selectBestAndWorstLaps } from "../src/services/laps";
import type { LapReport } from "../src/types/analysis";
import type { CleanedFrame } from "../src/types/telemetry";

function makeFrame(overrides: Partial<CleanedFrame> = {}): CleanedFrame {
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

function buildFullLapFrames(
  lap: number,
  count: number,
  startTs: number,
  intervalMs: number,
): CleanedFrame[] {
  return Array.from({ length: count }, (_, i) =>
    makeFrame({
      lap,
      ts: startTs + i * intervalMs,
      pos: i / (count - 1),
      spd: 200,
    }),
  );
}

describe("detectLaps — empty input", () => {
  test("returns empty array for empty input", () => {
    expect(detectLaps([])).toEqual([]);
  });
});

describe("detectLaps — single lap", () => {
  test("classifies a lap spanning pos 0→1 as full", () => {
    const frames = buildFullLapFrames(1, 21, 0, 100);
    const laps = detectLaps(frames);
    expect(laps).toHaveLength(1);
    expect(laps[0].lapNumber).toBe(1);
    expect(laps[0].classification).toBe("full");
    expect(laps[0].frames).toBe(21);
    expect(laps[0].posStart).toBeCloseTo(0, 5);
    expect(laps[0].posEnd).toBeCloseTo(1, 5);
    expect(laps[0].rawLapTimeMs).toBe(2000);
    expect(laps[0].hasDropout).toBe(false);
    expect(laps[0].dropoutMs).toBe(0);
    expect(laps[0].adjustedLapTimeMs).toBe(2000);
    expect(laps[0].adjustedLapTimeS).toBeCloseTo(2, 5);
    expect(laps[0].isFullRacingLap).toBe(true);
  });
});

describe("detectLaps — classification", () => {
  test("classifies full lap when posStart < 0.05 and posEnd > 0.9", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0.0 }),
      makeFrame({ ts: 1000, lap: 1, pos: 0.5 }),
      makeFrame({ ts: 2000, lap: 1, pos: 1.0 }),
    ];
    const laps = detectLaps(frames);
    expect(laps[0].classification).toBe("full");
    expect(laps[0].isFullRacingLap).toBe(true);
  });

  test("classifies out-lap when posStart > 0.1", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0.5 }),
      makeFrame({ ts: 1000, lap: 1, pos: 0.75 }),
      makeFrame({ ts: 2000, lap: 1, pos: 1.0 }),
    ];
    const laps = detectLaps(frames);
    expect(laps[0].classification).toBe("out-lap");
    expect(laps[0].isFullRacingLap).toBe(false);
  });

  test("classifies in-lap when posEnd < 0.9", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0.0 }),
      makeFrame({ ts: 1000, lap: 1, pos: 0.3 }),
      makeFrame({ ts: 2000, lap: 1, pos: 0.5 }),
    ];
    const laps = detectLaps(frames);
    expect(laps[0].classification).toBe("in-lap");
    expect(laps[0].isFullRacingLap).toBe(false);
  });

  test("classifies in-lap when final speed < 5 km/h (pitting)", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0.0, spd: 200 }),
      makeFrame({ ts: 1000, lap: 1, pos: 0.95, spd: 100 }),
      makeFrame({ ts: 2000, lap: 1, pos: 1.0, spd: 3 }),
    ];
    const laps = detectLaps(frames);
    expect(laps[0].classification).toBe("in-lap");
  });

  test("out-lap check takes precedence when posStart > 0.1", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0.5, spd: 200 }),
      makeFrame({ ts: 1000, lap: 1, pos: 0.6, spd: 3 }),
    ];
    const laps = detectLaps(frames);
    expect(laps[0].classification).toBe("out-lap");
  });
});

describe("detectLaps — multiple laps", () => {
  test("groups frames by lap field and preserves lap number", () => {
    const lap1 = buildFullLapFrames(1, 11, 0, 100);
    const lap2 = buildFullLapFrames(2, 11, 1100, 100);
    const laps = detectLaps([...lap1, ...lap2]);
    expect(laps).toHaveLength(2);
    expect(laps[0].lapNumber).toBe(1);
    expect(laps[1].lapNumber).toBe(2);
    expect(laps[1].rawLapTimeMs).toBe(1000);
  });

  test("handles non-sequential lap numbers", () => {
    const lap3 = buildFullLapFrames(3, 11, 0, 100);
    const lap5 = buildFullLapFrames(5, 11, 1100, 100);
    const laps = detectLaps([...lap3, ...lap5]);
    expect(laps).toHaveLength(2);
    expect(laps.map((l) => l.lapNumber)).toEqual([3, 5]);
  });
});

describe("detectLaps — dropout adjustment", () => {
  test("detects per-lap dropout and adjusts lap time", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0.0 }),
      makeFrame({ ts: 100, lap: 1, pos: 0.1 }),
      makeFrame({ ts: 800, lap: 1, pos: 0.5 }),
      makeFrame({ ts: 900, lap: 1, pos: 0.9 }),
      makeFrame({ ts: 1000, lap: 1, pos: 1.0 }),
    ];
    const laps = detectLaps(frames);
    expect(laps[0].hasDropout).toBe(true);
    expect(laps[0].dropoutMs).toBe(700);
    expect(laps[0].rawLapTimeMs).toBe(1000);
    expect(laps[0].adjustedLapTimeMs).toBe(300);
    expect(laps[0].adjustedLapTimeS).toBeCloseTo(0.3, 5);
  });

  test("sums multiple dropouts within a single lap", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0.0 }),
      makeFrame({ ts: 100, lap: 1, pos: 0.1 }),
      makeFrame({ ts: 700, lap: 1, pos: 0.4 }),
      makeFrame({ ts: 800, lap: 1, pos: 0.5 }),
      makeFrame({ ts: 1400, lap: 1, pos: 0.8 }),
      makeFrame({ ts: 1500, lap: 1, pos: 1.0 }),
    ];
    const laps = detectLaps(frames);
    expect(laps[0].dropoutMs).toBe(1200);
    expect(laps[0].rawLapTimeMs).toBe(1500);
    expect(laps[0].adjustedLapTimeMs).toBe(300);
  });

  test("no dropout when gaps are below 500ms", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0.0 }),
      makeFrame({ ts: 400, lap: 1, pos: 0.5 }),
      makeFrame({ ts: 800, lap: 1, pos: 1.0 }),
    ];
    const laps = detectLaps(frames);
    expect(laps[0].hasDropout).toBe(false);
    expect(laps[0].dropoutMs).toBe(0);
    expect(laps[0].adjustedLapTimeMs).toBe(800);
  });

  test("dropout in one lap does not affect another", () => {
    const lap1 = [
      makeFrame({ ts: 0, lap: 1, pos: 0.0 }),
      makeFrame({ ts: 100, lap: 1, pos: 0.1 }),
      makeFrame({ ts: 800, lap: 1, pos: 0.9 }),
      makeFrame({ ts: 900, lap: 1, pos: 1.0 }),
    ];
    const lap2 = buildFullLapFrames(2, 11, 1000, 100);
    const laps = detectLaps([...lap1, ...lap2]);
    expect(laps[0].hasDropout).toBe(true);
    expect(laps[0].dropoutMs).toBe(700);
    expect(laps[1].hasDropout).toBe(false);
    expect(laps[1].dropoutMs).toBe(0);
  });
});

describe("detectLaps — no full laps (all partial)", () => {
  test("returns all partial laps with isFullRacingLap false", () => {
    const frames = [
      makeFrame({ ts: 0, lap: 1, pos: 0.5 }),
      makeFrame({ ts: 1000, lap: 1, pos: 0.7 }),
      makeFrame({ ts: 2000, lap: 2, pos: 0.2 }),
      makeFrame({ ts: 3000, lap: 2, pos: 0.4 }),
    ];
    const laps = detectLaps(frames);
    expect(laps).toHaveLength(2);
    expect(laps.every((l) => l.isFullRacingLap === false)).toBe(true);
    expect(laps.map((l) => l.classification)).toEqual(["out-lap", "out-lap"]);
  });
});

describe("selectBestAndWorstLaps — edge cases", () => {
  test("returns -1 for both when no full racing laps exist", () => {
    const laps: LapReport[] = [
      {
        lapNumber: 1,
        classification: "out-lap",
        frames: 5,
        posStart: 0.5,
        posEnd: 0.7,
        rawLapTimeMs: 2000,
        adjustedLapTimeMs: 2000,
        adjustedLapTimeS: 2,
        hasDropout: false,
        dropoutMs: 0,
        isFullRacingLap: false,
      },
    ];
    expect(selectBestAndWorstLaps(laps)).toEqual({ bestLap: -1, worstLap: -1 });
  });

  test("returns -1 for empty input", () => {
    expect(selectBestAndWorstLaps([])).toEqual({ bestLap: -1, worstLap: -1 });
  });

  test("best=worst when only one full racing lap", () => {
    const laps: LapReport[] = [
      {
        lapNumber: 1,
        classification: "out-lap",
        frames: 5,
        posStart: 0.5,
        posEnd: 0.7,
        rawLapTimeMs: 2000,
        adjustedLapTimeMs: 2000,
        adjustedLapTimeS: 2,
        hasDropout: false,
        dropoutMs: 0,
        isFullRacingLap: false,
      },
      {
        lapNumber: 2,
        classification: "full",
        frames: 20,
        posStart: 0,
        posEnd: 1,
        rawLapTimeMs: 90000,
        adjustedLapTimeMs: 90000,
        adjustedLapTimeS: 90,
        hasDropout: false,
        dropoutMs: 0,
        isFullRacingLap: true,
      },
    ];
    expect(selectBestAndWorstLaps(laps)).toEqual({ bestLap: 2, worstLap: 2 });
  });
});

describe("selectBestAndWorstLaps — clean laps", () => {
  function makeFullLap(
    lapNumber: number,
    adjustedMs: number,
    hasDropout = false,
    dropoutMs = 0,
  ): LapReport {
    return {
      lapNumber,
      classification: "full",
      frames: 20,
      posStart: 0,
      posEnd: 1,
      rawLapTimeMs: adjustedMs + dropoutMs,
      adjustedLapTimeMs: adjustedMs,
      adjustedLapTimeS: adjustedMs / 1000,
      hasDropout,
      dropoutMs,
      isFullRacingLap: true,
    };
  }

  test("selects fastest clean full lap as best, slowest as worst", () => {
    const laps = [makeFullLap(1, 95000), makeFullLap(2, 90000), makeFullLap(3, 92000)];
    expect(selectBestAndWorstLaps(laps)).toEqual({ bestLap: 2, worstLap: 1 });
  });

  test("prefers clean lap over faster lap with dropout for best", () => {
    const laps = [
      makeFullLap(1, 88000, true, 5000),
      makeFullLap(2, 90000, false, 0),
      makeFullLap(3, 95000, false, 0),
    ];
    const result = selectBestAndWorstLaps(laps);
    expect(result.bestLap).toBe(2);
    expect(result.worstLap).toBe(3);
  });

  test("falls back to fastest full lap with dropout when all full laps have dropouts", () => {
    const laps = [makeFullLap(1, 88000, true, 5000), makeFullLap(2, 95000, true, 3000)];
    const result = selectBestAndWorstLaps(laps);
    expect(result.bestLap).toBe(1);
    expect(result.worstLap).toBe(2);
  });

  test("worst is always the slowest full lap regardless of dropout", () => {
    const laps = [makeFullLap(1, 90000, false, 0), makeFullLap(2, 100000, true, 5000)];
    const result = selectBestAndWorstLaps(laps);
    expect(result.bestLap).toBe(1);
    expect(result.worstLap).toBe(2);
  });

  test("ignores partial laps in selection", () => {
    const laps: LapReport[] = [
      {
        lapNumber: 1,
        classification: "out-lap",
        frames: 5,
        posStart: 0.5,
        posEnd: 0.7,
        rawLapTimeMs: 50000,
        adjustedLapTimeMs: 50000,
        adjustedLapTimeS: 50,
        hasDropout: false,
        dropoutMs: 0,
        isFullRacingLap: false,
      },
      makeFullLap(2, 90000),
      makeFullLap(3, 95000),
    ];
    expect(selectBestAndWorstLaps(laps)).toEqual({ bestLap: 2, worstLap: 3 });
  });
});

describe("detectLaps — real sample data", () => {
  test("analyzes a realistic multi-lap stint with mixed classifications and a dropout", () => {
    const outLap = [
      makeFrame({ ts: 0, lap: 1, pos: 0.5, spd: 80 }),
      makeFrame({ ts: 5000, lap: 1, pos: 0.9, spd: 200 }),
    ];
    const fullLap2 = buildFullLapFrames(2, 101, 5000, 1000);

    let ts3 = fullLap2[fullLap2.length - 1].ts + 1000;
    const fullLap3Frames: CleanedFrame[] = [];
    for (let i = 0; i < 50; i++) {
      fullLap3Frames.push(makeFrame({ lap: 3, ts: ts3, pos: i / 100, spd: 200 }));
      ts3 += 1000;
    }
    ts3 += 5000;
    for (let i = 0; i < 51; i++) {
      fullLap3Frames.push(makeFrame({ lap: 3, ts: ts3, pos: (50 + i) / 100, spd: 200 }));
      ts3 += 1000;
    }

    const inLap = [
      makeFrame({ ts: ts3, lap: 4, pos: 0.0, spd: 200 }),
      makeFrame({ ts: ts3 + 3000, lap: 4, pos: 0.3, spd: 50 }),
    ];

    const laps = detectLaps([...outLap, ...fullLap2, ...fullLap3Frames, ...inLap]);
    expect(laps).toHaveLength(4);
    expect(laps.map((l) => l.lapNumber)).toEqual([1, 2, 3, 4]);
    expect(laps[0].classification).toBe("out-lap");
    expect(laps[1].classification).toBe("full");
    expect(laps[2].classification).toBe("full");
    expect(laps[2].hasDropout).toBe(true);
    expect(laps[2].dropoutMs).toBe(6000);
    expect(laps[3].classification).toBe("in-lap");

    const selection = selectBestAndWorstLaps(laps);
    expect(selection.bestLap).toBe(2);
    expect(selection.worstLap).toBe(3);
  });
});
