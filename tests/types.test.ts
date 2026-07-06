import { expect, test, describe } from "bun:test";
import type {
  WireTyres,
  WireFrame,
  ParsedStint,
  DecodedFrame,
  DecodedTyres,
  CleanedFrame,
} from "../src/types/telemetry";
import type {
  AnalysisResult,
  RecorderFinding,
  DataQuality,
  RemovedFrameDetail,
  DropoutDetail,
  LapReport,
  DetectedCorner,
  CornerPhase,
  TimeLossReport,
  CornerDelta,
  RootCause,
  RootCauseMetrics,
  CornerMetrics,
  MetricDeltas,
  RadioCall,
  TraceabilityEntry,
} from "../src/types/analysis";

describe("telemetry types compile", () => {
  test("WireTyres", () => {
    const tyres: WireTyres = { fl: 0, fr: 0, rl: 0, rr: 0 };
    expect(tyres.fl).toBe(0);
  });

  test("WireFrame", () => {
    const frame: WireFrame = {
      ts: 1000,
      lap: 1,
      pos: 0,
      spd: 200,
      thr: 0.5,
      brk: 0.0,
      str: 0,
      gear: 3,
      rpm: 8000,
      tyres: { fl: 0, fr: 0, rl: 0, rr: 0 },
    };
    expect(frame.ts).toBe(1000);
  });

  test("ParsedStint", () => {
    const stint: ParsedStint = {
      schema: "racemake/v1",
      frame_count: 0,
      frames: [],
    };
    expect(stint.frame_count).toBe(0);
  });

  test("DecodedTyres", () => {
    const tyres: DecodedTyres = { fl: 90.5, fr: 91.2, rl: 88.0, rr: 87.8 };
    expect(tyres.fl).toBe(90.5);
  });

  test("DecodedFrame", () => {
    const frame: DecodedFrame = {
      ts: 1000,
      lap: 1,
      pos: 0,
      spd: 200,
      thr: 0.5,
      brk: 0.0,
      str: 0,
      gear: 3,
      rpm: 8000,
      tyres: { fl: 90.5, fr: 91.2, rl: 88.0, rr: 87.8 },
    };
    expect(frame.tyres.fl).toBe(90.5);
  });

  test("CleanedFrame is DecodedFrame alias", () => {
    const frame: CleanedFrame = {
      ts: 1000,
      lap: 1,
      pos: 0,
      spd: 200,
      thr: 0.5,
      brk: 0.0,
      str: 0,
      gear: 3,
      rpm: 8000,
      tyres: { fl: 90.5, fr: 91.2, rl: 88.0, rr: 87.8 },
    };
    expect(frame.tyres.fl).toBe(90.5);
  });
});

describe("analysis types compile", () => {
  test("RecorderFinding", () => {
    const finding: RecorderFinding = {
      field: "tyres",
      description: "raw i16 divided by 10",
      scaleFactor: 0.1,
      example: { raw: 905, decoded: 90.5, unit: "C" },
    };
    expect(finding.scaleFactor).toBe(0.1);
  });

  test("RemovedFrameDetail", () => {
    const detail: RemovedFrameDetail = {
      ts: 5000,
      reason: "spd out of range",
      values: { spd: 9999, rpm: 0 },
    };
    expect(detail.reason).toBe("spd out of range");
  });

  test("DropoutDetail", () => {
    const dropout: DropoutDetail = {
      lap: 2,
      tsBefore: 1000,
      tsAfter: 2000,
      gapMs: 1000,
      posBefore: 100,
      posAfter: 200,
    };
    expect(dropout.gapMs).toBe(1000);
  });

  test("DataQuality", () => {
    const dq: DataQuality = {
      totalFrames: 100,
      validFrames: 95,
      removedFrames: 5,
      removedFrameDetails: [],
      dropouts: [],
      frameRate: { meanMs: 10, medianMs: 10, stdevMs: 1, minMs: 8, maxMs: 12 },
    };
    expect(dq.validFrames).toBe(95);
  });

  test("LapReport", () => {
    const lap: LapReport = {
      lapNumber: 1,
      classification: "full",
      frames: 600,
      posStart: 0,
      posEnd: 5280,
      rawLapTimeMs: 90000,
      adjustedLapTimeMs: 90000,
      adjustedLapTimeS: 90.0,
      hasDropout: false,
      dropoutMs: 0,
      isFullRacingLap: true,
    };
    expect(lap.isFullRacingLap).toBe(true);
  });

  test("DetectedCorner", () => {
    const corner: DetectedCorner = {
      cornerId: "C1",
      positionRange: { entry: 100, apex: 200, exit: 300 },
      direction: "left",
      peakSteeringDeg: 180,
      consensusStrength: 0.95,
      detectedOnLaps: [2, 3, 4],
      confidence: "high",
    };
    expect(corner.confidence).toBe("high");
  });

  test("CornerPhase", () => {
    const phase: CornerPhase = "apex";
    expect(phase).toBe("apex");
  });

  test("CornerMetrics", () => {
    const metrics: CornerMetrics = {
      minSpeedKmh: 80,
      maxBrake: 1.0,
      minThrottle: 0.0,
      maxSteeringDeg: 180,
      minGear: 2,
      tyreTempEntryC: { fl: 90, fr: 91, rl: 88, rr: 87 },
    };
    expect(metrics.minSpeedKmh).toBe(80);
  });

  test("MetricDeltas", () => {
    const deltas: MetricDeltas = {
      speedDeltaKmh: -10,
      brakeDelta: 0.2,
      throttleDelta: -0.1,
      steeringDeltaDeg: 15,
      gearDelta: 0,
      tyreTempDeltaC: { fl: 2, fr: 3, rl: 1, rr: 1 },
    };
    expect(deltas.speedDeltaKmh).toBe(-10);
  });

  test("RootCauseMetrics", () => {
    const metrics: RootCauseMetrics = {
      bestLap: {
        minSpeedKmh: 80,
        maxBrake: 1.0,
        minThrottle: 0.0,
        maxSteeringDeg: 180,
        minGear: 2,
        tyreTempEntryC: { fl: 90, fr: 91, rl: 88, rr: 87 },
      },
      worstLap: {
        minSpeedKmh: 70,
        maxBrake: 1.2,
        minThrottle: 0.0,
        maxSteeringDeg: 200,
        minGear: 1,
        tyreTempEntryC: { fl: 92, fr: 94, rl: 89, rr: 88 },
      },
      deltas: {
        speedDeltaKmh: -10,
        brakeDelta: 0.2,
        throttleDelta: -0.1,
        steeringDeltaDeg: 20,
        gearDelta: -1,
        tyreTempDeltaC: { fl: 2, fr: 3, rl: 1, rr: 1 },
      },
    };
    expect(metrics.deltas.speedDeltaKmh).toBe(-10);
  });

  test("RootCause", () => {
    const rootCause: RootCause = {
      cornerId: "C1",
      metrics: {
        bestLap: {
          minSpeedKmh: 80,
          maxBrake: 1.0,
          minThrottle: 0.0,
          maxSteeringDeg: 180,
          minGear: 2,
          tyreTempEntryC: { fl: 90, fr: 91, rl: 88, rr: 87 },
        },
        worstLap: {
          minSpeedKmh: 70,
          maxBrake: 1.2,
          minThrottle: 0.0,
          maxSteeringDeg: 200,
          minGear: 1,
          tyreTempEntryC: { fl: 92, fr: 94, rl: 89, rr: 88 },
        },
        deltas: {
          speedDeltaKmh: -10,
          brakeDelta: 0.2,
          throttleDelta: -0.1,
          steeringDeltaDeg: 20,
          gearDelta: -1,
          tyreTempDeltaC: { fl: 2, fr: 3, rl: 1, rr: 1 },
        },
      },
      explanation: "later braking caused overshoot",
    };
    expect(rootCause.cornerId).toBe("C1");
  });

  test("CornerDelta", () => {
    const delta: CornerDelta = {
      cornerId: "C1",
      totalDeltaS: 0.3,
      entryDeltaS: 0.1,
      apexDeltaS: 0.15,
      exitDeltaS: 0.05,
      isWorstCorner: true,
      significance: "high",
      hasGap: true,
    };
    expect(delta.isWorstCorner).toBe(true);
  });

  test("TimeLossReport", () => {
    const report: TimeLossReport = {
      bestLap: 2,
      worstLap: 4,
      bestLapTimeS: 90.0,
      worstLapTimeS: 90.5,
      totalDeltaS: 0.5,
      cornerDeltas: [],
      rootCause: {
        cornerId: "C1",
        metrics: {
          bestLap: {
            minSpeedKmh: 80,
            maxBrake: 1.0,
            minThrottle: 0.0,
            maxSteeringDeg: 180,
            minGear: 2,
            tyreTempEntryC: { fl: 90, fr: 91, rl: 88, rr: 87 },
          },
          worstLap: {
            minSpeedKmh: 70,
            maxBrake: 1.2,
            minThrottle: 0.0,
            maxSteeringDeg: 200,
            minGear: 1,
            tyreTempEntryC: { fl: 92, fr: 94, rl: 89, rr: 88 },
          },
          deltas: {
            speedDeltaKmh: -10,
            brakeDelta: 0.2,
            throttleDelta: -0.1,
            steeringDeltaDeg: 20,
            gearDelta: -1,
            tyreTempDeltaC: { fl: 2, fr: 3, rl: 1, rr: 1 },
          },
        },
        explanation: "later braking caused overshoot",
      },
      sanityCheck: { sumOfCornerDeltasS: 0.5, totalDeltaS: 0.5, passed: true },
    };
    expect(report.sanityCheck.passed).toBe(true);
  });

  test("TraceabilityEntry", () => {
    const entry: TraceabilityEntry = {
      claim: "worst lap is lap 4",
      source: "lap reports",
      value: "90.5s",
    };
    expect(entry.claim).toBe("worst lap is lap 4");
  });

  test("RadioCall", () => {
    const call: RadioCall = {
      message: "You lost 0.3s in T1 due to braking too late.",
      traceability: [
        { claim: "0.3s lost in T1", source: "corner deltas", value: "0.3s" },
      ],
      confidenceFlags: [],
    };
    expect(call.message.length).toBeGreaterThan(0);
  });

  test("AnalysisResult full shape", () => {
    const result: AnalysisResult = {
      recorderFinding: {
        field: "tyres",
        description: "raw i16 divided by 10",
        scaleFactor: 0.1,
        example: { raw: 905, decoded: 90.5, unit: "C" },
      },
      dataQuality: {
        totalFrames: 100,
        validFrames: 95,
        removedFrames: 5,
        removedFrameDetails: [],
        dropouts: [],
        frameRate: { meanMs: 10, medianMs: 10, stdevMs: 1, minMs: 8, maxMs: 12 },
      },
      laps: [],
      corners: [],
      timeLoss: {
        bestLap: 2,
        worstLap: 4,
        bestLapTimeS: 90.0,
        worstLapTimeS: 90.5,
        totalDeltaS: 0.5,
        cornerDeltas: [],
        rootCause: {
          cornerId: "C1",
          metrics: {
            bestLap: {
              minSpeedKmh: 80,
              maxBrake: 1.0,
              minThrottle: 0.0,
              maxSteeringDeg: 180,
              minGear: 2,
              tyreTempEntryC: { fl: 90, fr: 91, rl: 88, rr: 87 },
            },
            worstLap: {
              minSpeedKmh: 70,
              maxBrake: 1.2,
              minThrottle: 0.0,
              maxSteeringDeg: 200,
              minGear: 1,
              tyreTempEntryC: { fl: 92, fr: 94, rl: 89, rr: 88 },
            },
            deltas: {
              speedDeltaKmh: -10,
              brakeDelta: 0.2,
              throttleDelta: -0.1,
              steeringDeltaDeg: 20,
              gearDelta: -1,
              tyreTempDeltaC: { fl: 2, fr: 3, rl: 1, rr: 1 },
            },
          },
          explanation: "later braking caused overshoot",
        },
        sanityCheck: { sumOfCornerDeltasS: 0.5, totalDeltaS: 0.5, passed: true },
      },
      radioCall: {
        message: "You lost 0.3s in T1 due to braking too late.",
        traceability: [],
        confidenceFlags: [],
      },
    };
    expect(result.dataQuality.validFrames).toBe(95);
  });
});