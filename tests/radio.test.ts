import { describe, expect, test } from "bun:test";
import { generateRadioCall } from "../src/services/radio";
import type {
  CornerDelta,
  CornerMetrics,
  DetectedCorner,
  MetricDeltas,
  RootCause,
  RootCauseMetrics,
  TimeLossReport,
} from "../src/types/analysis";

function makeCornerMetrics(overrides: Partial<CornerMetrics> = {}): CornerMetrics {
  return {
    minSpeedKmh: 214,
    maxBrake: 0,
    minThrottle: 0.95,
    maxSteeringDeg: 28,
    minGear: 6,
    tyreTempEntryC: { fl: 95, fr: 95, rl: 95, rr: 95 },
    ...overrides,
  };
}

function makeMetricDeltas(overrides: Partial<MetricDeltas> = {}): MetricDeltas {
  return {
    speedDeltaKmh: -37,
    brakeDelta: 0.45,
    throttleDelta: -0.6,
    steeringDeltaDeg: 2,
    gearDelta: -1,
    tyreTempDeltaC: { fl: 22, fr: 15, rl: 5, rr: 5 },
    ...overrides,
  };
}

function makeRootCauseMetrics(overrides: Partial<RootCauseMetrics> = {}): RootCauseMetrics {
  return {
    bestLap: makeCornerMetrics(),
    worstLap: makeCornerMetrics({
      minSpeedKmh: 177,
      maxBrake: 0.45,
      minThrottle: 0.3,
      minGear: 5,
      tyreTempEntryC: { fl: 117, fr: 110, rl: 100, rr: 100 },
    }),
    deltas: makeMetricDeltas(),
    ...overrides,
  };
}

function makeRootCause(overrides: Partial<RootCause> = {}): RootCause {
  return {
    cornerId: "C2",
    metrics: makeRootCauseMetrics(),
    explanation: "At C2 (left at pos 0.205), 0.386s lost.",
    ...overrides,
  };
}

function makeCornerDelta(overrides: Partial<CornerDelta> = {}): CornerDelta {
  return {
    cornerId: "C2",
    totalDeltaS: 0.386,
    entryDeltaS: 0.15,
    apexDeltaS: 0,
    exitDeltaS: 0.236,
    isWorstCorner: true,
    significance: "high",
    hasGap: false,
    ...overrides,
  };
}

function makeTimeLossReport(overrides: Partial<TimeLossReport> = {}): TimeLossReport {
  return {
    bestLap: 2,
    worstLap: 3,
    bestLapTimeS: 90.0,
    worstLapTimeS: 90.386,
    totalDeltaS: 0.386,
    cornerDeltas: [makeCornerDelta()],
    rootCause: makeRootCause(),
    sanityCheck: { sumOfCornerDeltasS: 0.386, totalDeltaS: 0.386, passed: true },
    ...overrides,
  };
}

function makeDetectedCorner(overrides: Partial<DetectedCorner> = {}): DetectedCorner {
  return {
    cornerId: "C2",
    positionRange: { entry: 0.15, apex: 0.205, exit: 0.26 },
    direction: "left",
    peakSteeringDeg: 30,
    consensusStrength: 1.0,
    detectedOnLaps: [2, 3],
    confidence: "high",
    ...overrides,
  };
}

function extractNumbersFromMessage(text: string): string[] {
  return [...text.matchAll(/(?<!\w)(\d+(?:\.\d+)?)/g)].map((m) => m[1]);
}

const STANDARD_CORNERS = (): DetectedCorner[] => [makeDetectedCorner()];
const STANDARD_TIME_LOSS = (): TimeLossReport => makeTimeLossReport();

describe("generateRadioCall — standard case", () => {
  test("returns a RadioCall with message, traceability, and confidenceFlags", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
    expect(Array.isArray(result.traceability)).toBe(true);
    expect(result.traceability.length).toBeGreaterThan(0);
    expect(Array.isArray(result.confidenceFlags)).toBe(true);
  });

  test("message references the total delta value", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("0.386");
  });

  test("message references the corner ID", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("C2");
  });

  test("message references both lap numbers", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("Lap 2");
    expect(result.message).toContain("Lap 3");
  });

  test("message references speeds from both laps", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("214");
    expect(result.message).toContain("177");
  });

  test("message references brake and gear for worst lap", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("0.45");
    expect(result.message).toContain("5th");
  });

  test("message references tyre temperature and delta", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("117");
    expect(result.message).toContain("22");
  });
});

describe("generateRadioCall — traceability", () => {
  test("every traceability claim appears in the message", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    for (const entry of result.traceability) {
      expect(result.message).toContain(entry.claim);
    }
  });

  test("traceability includes total delta with correct source and value", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    const entry = result.traceability.find((e) => e.source === "cornerDelta.totalDeltaS");
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("0.386");
  });

  test("traceability includes corner ID", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    const entry = result.traceability.find((e) => e.source === "worstCorner.cornerId");
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("C2");
  });

  test("traceability includes apex position", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    const entry = result.traceability.find((e) => e.source === "worstCorner.positionRange.apex");
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("0.205");
  });

  test("traceability includes best lap speed", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    const entry = result.traceability.find((e) => e.source === "bestMetrics.minSpeedKmh");
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("214");
  });

  test("traceability includes worst lap speed", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    const entry = result.traceability.find((e) => e.source === "worstMetrics.minSpeedKmh");
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("177");
  });

  test("traceability includes worst lap brake", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    const entry = result.traceability.find((e) => e.source === "worstMetrics.maxBrake");
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("0.45");
  });

  test("traceability includes both lap numbers", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    const bestLapEntry = result.traceability.find((e) => e.source === "bestLapNumber");
    expect(bestLapEntry).toBeDefined();
    expect(bestLapEntry?.value).toBe("2");
    const worstLapEntry = result.traceability.find((e) => e.source === "worstLapNumber");
    expect(worstLapEntry).toBeDefined();
    expect(worstLapEntry?.value).toBe("3");
  });

  test("traceability includes tyre temp and delta", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    const tempEntry = result.traceability.find(
      (e) => e.source === "worstMetrics.tyreTempEntryC.fl",
    );
    expect(tempEntry).toBeDefined();
    expect(tempEntry?.value).toBe("117");
    const deltaEntry = result.traceability.find((e) => e.source === "deltas.tyreTempDeltaC.fl");
    expect(deltaEntry).toBeDefined();
    expect(deltaEntry?.value).toBe("22");
  });
});

describe("generateRadioCall — no invented numbers", () => {
  test("every number in the standard message appears in traceability values", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    const numbers = extractNumbersFromMessage(result.message);
    expect(numbers.length).toBeGreaterThan(0);
    for (const num of numbers) {
      const traced = result.traceability.some((e) => e.value === num);
      expect(traced).toBe(true);
    }
  });

  test("every number in the zero-delta message appears in traceability values", () => {
    const timeLoss = makeTimeLossReport({
      totalDeltaS: 0,
      cornerDeltas: [
        makeCornerDelta({
          totalDeltaS: 0,
          entryDeltaS: 0,
          exitDeltaS: 0,
          significance: "none",
        }),
      ],
    });
    const result = generateRadioCall(timeLoss, STANDARD_CORNERS(), 2, 3);
    const numbers = extractNumbersFromMessage(result.message);
    for (const num of numbers) {
      const traced = result.traceability.some((e) => e.value === num);
      expect(traced).toBe(true);
    }
  });

  test("every number in the no-corners message appears in traceability values", () => {
    const timeLoss = makeTimeLossReport({
      cornerDeltas: [],
      rootCause: makeRootCause({
        cornerId: "",
        metrics: {
          bestLap: makeCornerMetrics({
            minSpeedKmh: 0,
            maxBrake: 0,
            minThrottle: 0,
            maxSteeringDeg: 0,
            minGear: 0,
            tyreTempEntryC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          }),
          worstLap: makeCornerMetrics({
            minSpeedKmh: 0,
            maxBrake: 0,
            minThrottle: 0,
            maxSteeringDeg: 0,
            minGear: 0,
            tyreTempEntryC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          }),
          deltas: {
            speedDeltaKmh: 0,
            brakeDelta: 0,
            throttleDelta: 0,
            steeringDeltaDeg: 0,
            gearDelta: 0,
            tyreTempDeltaC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          },
        },
        explanation: "No corners detected; unable to localize time loss.",
      }),
    });
    const result = generateRadioCall(timeLoss, [], 2, 3);
    const numbers = extractNumbersFromMessage(result.message);
    for (const num of numbers) {
      const traced = result.traceability.some((e) => e.value === num);
      expect(traced).toBe(true);
    }
  });

  test("every number in the missing-metrics message appears in traceability values", () => {
    const timeLoss = makeTimeLossReport({
      rootCause: makeRootCause({
        metrics: {
          bestLap: makeCornerMetrics({
            minSpeedKmh: 0,
            maxBrake: 0,
            minThrottle: 0,
            maxSteeringDeg: 0,
            minGear: 0,
            tyreTempEntryC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          }),
          worstLap: makeCornerMetrics({
            minSpeedKmh: 0,
            maxBrake: 0,
            minThrottle: 0,
            maxSteeringDeg: 0,
            minGear: 0,
            tyreTempEntryC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          }),
          deltas: {
            speedDeltaKmh: 0,
            brakeDelta: 0,
            throttleDelta: 0,
            steeringDeltaDeg: 0,
            gearDelta: 0,
            tyreTempDeltaC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          },
        },
      }),
    });
    const result = generateRadioCall(timeLoss, STANDARD_CORNERS(), 2, 3);
    const numbers = extractNumbersFromMessage(result.message);
    for (const num of numbers) {
      const traced = result.traceability.some((e) => e.value === num);
      expect(traced).toBe(true);
    }
  });
});

describe("generateRadioCall — confidence flags", () => {
  test("includes gap flag when any cornerDelta has hasGap=true", () => {
    const timeLoss = makeTimeLossReport({
      cornerDeltas: [makeCornerDelta({ hasGap: true })],
    });
    const result = generateRadioCall(timeLoss, STANDARD_CORNERS(), 2, 3);
    expect(result.confidenceFlags.length).toBeGreaterThan(0);
    expect(result.confidenceFlags.some((f) => f.toLowerCase().includes("gap"))).toBe(true);
  });

  test("does not include gap flag when no cornerDeltas have hasGap", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.confidenceFlags.some((f) => f.toLowerCase().includes("gap"))).toBe(false);
  });

  test("includes single-lap flag when corners detected on only one lap", () => {
    const corners = [makeDetectedCorner({ detectedOnLaps: [2] })];
    const result = generateRadioCall(STANDARD_TIME_LOSS(), corners, 2, 3);
    expect(result.confidenceFlags.some((f) => f.toLowerCase().includes("single lap"))).toBe(true);
  });

  test("does not include single-lap flag when corners detected on multiple laps", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.confidenceFlags.some((f) => f.toLowerCase().includes("single lap"))).toBe(false);
  });

  test("includes single-lap flag when corners array is empty", () => {
    const timeLoss = makeTimeLossReport({ cornerDeltas: [] });
    const result = generateRadioCall(timeLoss, [], 2, 3);
    expect(result.confidenceFlags.some((f) => f.toLowerCase().includes("single lap"))).toBe(true);
  });
});

describe("generateRadioCall — edge cases", () => {
  test("zero total delta produces valid radio call without crashing", () => {
    const timeLoss = makeTimeLossReport({
      totalDeltaS: 0,
      cornerDeltas: [
        makeCornerDelta({
          totalDeltaS: 0,
          entryDeltaS: 0,
          exitDeltaS: 0,
          significance: "none",
        }),
      ],
    });
    const result = generateRadioCall(timeLoss, STANDARD_CORNERS(), 2, 3);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
    expect(Array.isArray(result.traceability)).toBe(true);
    expect(result.traceability.length).toBeGreaterThan(0);
  });

  test("no corners produces valid radio call without crashing", () => {
    const timeLoss = makeTimeLossReport({
      cornerDeltas: [],
      rootCause: makeRootCause({
        cornerId: "",
        metrics: {
          bestLap: makeCornerMetrics({
            minSpeedKmh: 0,
            maxBrake: 0,
            minThrottle: 0,
            maxSteeringDeg: 0,
            minGear: 0,
            tyreTempEntryC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          }),
          worstLap: makeCornerMetrics({
            minSpeedKmh: 0,
            maxBrake: 0,
            minThrottle: 0,
            maxSteeringDeg: 0,
            minGear: 0,
            tyreTempEntryC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          }),
          deltas: {
            speedDeltaKmh: 0,
            brakeDelta: 0,
            throttleDelta: 0,
            steeringDeltaDeg: 0,
            gearDelta: 0,
            tyreTempDeltaC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          },
        },
        explanation: "No corners detected; unable to localize time loss.",
      }),
    });
    const result = generateRadioCall(timeLoss, [], 2, 3);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
    expect(Array.isArray(result.traceability)).toBe(true);
    expect(result.message).toContain("0.386");
  });

  test("missing metrics (all zeros) produces valid radio call", () => {
    const timeLoss = makeTimeLossReport({
      rootCause: makeRootCause({
        metrics: {
          bestLap: makeCornerMetrics({
            minSpeedKmh: 0,
            maxBrake: 0,
            minThrottle: 0,
            maxSteeringDeg: 0,
            minGear: 0,
            tyreTempEntryC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          }),
          worstLap: makeCornerMetrics({
            minSpeedKmh: 0,
            maxBrake: 0,
            minThrottle: 0,
            maxSteeringDeg: 0,
            minGear: 0,
            tyreTempEntryC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          }),
          deltas: {
            speedDeltaKmh: 0,
            brakeDelta: 0,
            throttleDelta: 0,
            steeringDeltaDeg: 0,
            gearDelta: 0,
            tyreTempDeltaC: { fl: 0, fr: 0, rl: 0, rr: 0 },
          },
        },
      }),
    });
    const result = generateRadioCall(timeLoss, STANDARD_CORNERS(), 2, 3);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
    expect(Array.isArray(result.traceability)).toBe(true);
  });

  test("best lap flat (no brake) is described as flat", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("flat");
  });

  test("worst lap with brake is described with brake value", () => {
    const result = generateRadioCall(STANDARD_TIME_LOSS(), STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("braked");
    expect(result.message).toContain("0.45");
  });

  test("small tyre delta does not generate tyre description with numbers", () => {
    const timeLoss = makeTimeLossReport({
      rootCause: makeRootCause({
        metrics: makeRootCauseMetrics({
          deltas: makeMetricDeltas({
            tyreTempDeltaC: { fl: 2, fr: 1, rl: 0, rr: 0 },
          }),
          worstLap: makeCornerMetrics({
            minSpeedKmh: 177,
            maxBrake: 0.45,
            minThrottle: 0.3,
            minGear: 5,
            tyreTempEntryC: { fl: 97, fr: 96, rl: 95, rr: 95 },
          }),
        }),
      }),
    });
    const result = generateRadioCall(timeLoss, STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("similar");
  });

  test("negative corner delta uses absolute value in message", () => {
    const timeLoss = makeTimeLossReport({
      cornerDeltas: [makeCornerDelta({ totalDeltaS: -0.386 })],
    });
    const result = generateRadioCall(timeLoss, STANDARD_CORNERS(), 2, 3);
    expect(result.message).toContain("0.386");
    const numbers = extractNumbersFromMessage(result.message);
    for (const num of numbers) {
      const traced = result.traceability.some((e) => e.value === num);
      expect(traced).toBe(true);
    }
  });
});
