import { expect, test, describe } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { runAnalysisPipeline } from "../src/routes/analysis";
import type { AnalysisResult } from "../src/types/analysis";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");

function loadFixture(name: string): unknown {
  const raw = readFileSync(join(FIXTURES_DIR, name), "utf-8");
  return JSON.parse(raw);
}

function extractNumbersFromMessage(text: string): string[] {
  return [...text.matchAll(/(?<!\w)(\d+(?:\.\d+)?)/g)].map((m) => m[1]);
}

describe("runAnalysisPipeline — sample telemetry", () => {
  const result = runAnalysisPipeline(
    loadFixture("sample-telemetry.json") as Parameters<typeof runAnalysisPipeline>[0],
  ) as AnalysisResult;

  test("recorderFinding reports the tyre temperature scale of 10.0", () => {
    expect(result.recorderFinding).toBeDefined();
    expect(result.recorderFinding.scaleFactor).toBe(10.0);
    expect(result.recorderFinding.field).toBe("tyres");
  });

  test("dataQuality counts match the known sample (7195 / 7194 / 1)", () => {
    expect(result.dataQuality.totalFrames).toBe(7195);
    expect(result.dataQuality.validFrames).toBe(7194);
    expect(result.dataQuality.removedFrames).toBe(1);
    expect(result.dataQuality.validFrames + result.dataQuality.removedFrames).toBe(
      result.dataQuality.totalFrames,
    );
  });

  test("detects 6 laps, 4 of which are full racing laps", () => {
    expect(result.laps).toHaveLength(6);
    const fullLaps = result.laps.filter((lap) => lap.isFullRacingLap);
    expect(fullLaps).toHaveLength(4);
  });

  test("detects 7 corners, each detected on all 4 full racing laps", () => {
    expect(result.corners).toHaveLength(7);
    for (const corner of result.corners) {
      expect(corner.detectedOnLaps).toHaveLength(4);
      expect(corner.confidence).toBe("high");
      expect(corner.consensusStrength).toBe(1.0);
    }
  });

  test("timeLoss reports a best lap, a worst lap, and a positive total delta", () => {
    expect(result.timeLoss.bestLap).toBeGreaterThan(0);
    expect(result.timeLoss.worstLap).toBeGreaterThan(0);
    expect(result.timeLoss.totalDeltaS).toBeGreaterThan(0);
    expect(result.timeLoss.cornerDeltas.length).toBe(result.corners.length);
  });

  test("radioCall has a non-empty message and a non-empty traceability array", () => {
    expect(result.radioCall.message.length).toBeGreaterThan(0);
    expect(result.radioCall.traceability.length).toBeGreaterThan(0);
  });

  test("every number in the radioCall message appears in traceability values", () => {
    const numbers = extractNumbersFromMessage(result.radioCall.message);
    expect(numbers.length).toBeGreaterThan(0);
    for (const num of numbers) {
      const traced = result.radioCall.traceability.some((entry) => entry.value === num);
      expect(traced).toBe(true);
    }
  });
});

describe("runAnalysisPipeline — synthetic 5-corner fixture", () => {
  const result = runAnalysisPipeline(
    loadFixture("synthetic-5corner.json") as Parameters<typeof runAnalysisPipeline>[0],
  ) as AnalysisResult;

  test("detects exactly 5 corners", () => {
    expect(result.corners).toHaveLength(5);
  });

  test("each corner is detected on all full racing laps", () => {
    const fullLapCount = result.laps.filter((lap) => lap.isFullRacingLap).length;
    expect(fullLapCount).toBeGreaterThan(1);
    for (const corner of result.corners) {
      expect(corner.detectedOnLaps).toHaveLength(fullLapCount);
      expect(corner.consensusStrength).toBe(1.0);
      expect(corner.confidence).toBe("high");
    }
  });

  test("corner apex positions match the designed 0.10 / 0.25 / 0.45 / 0.65 / 0.85 layout", () => {
    const apexPositions = result.corners.map((c) => c.positionRange.apex).sort((a, b) => a - b);
    const designed = [0.10, 0.25, 0.45, 0.65, 0.85];
    for (let i = 0; i < designed.length; i++) {
      expect(apexPositions[i]).toBeCloseTo(designed[i], 1);
    }
  });
});

describe("runAnalysisPipeline — edge cases do not crash", () => {
  test("empty frames array produces an empty result without throwing", () => {
    const result = runAnalysisPipeline(
      loadFixture("edge-empty.json") as Parameters<typeof runAnalysisPipeline>[0],
    ) as AnalysisResult;
    expect(result.dataQuality.totalFrames).toBe(0);
    expect(result.dataQuality.validFrames).toBe(0);
    expect(result.laps).toEqual([]);
    expect(result.corners).toEqual([]);
    expect(result.radioCall).toBeDefined();
  });

  test("single frame does not crash and reports one total frame", () => {
    const result = runAnalysisPipeline(
      loadFixture("edge-single-frame.json") as Parameters<typeof runAnalysisPipeline>[0],
    ) as AnalysisResult;
    expect(result.dataQuality.totalFrames).toBe(1);
    expect(result.radioCall).toBeDefined();
  });

  test("single full lap produces one lap report and does not crash", () => {
    const result = runAnalysisPipeline(
      loadFixture("edge-single-lap.json") as Parameters<typeof runAnalysisPipeline>[0],
    ) as AnalysisResult;
    expect(result.laps.length).toBeGreaterThanOrEqual(1);
    expect(result.radioCall).toBeDefined();
  });

  test("clean data with no garbage frames yields zero removed frames", () => {
    const result = runAnalysisPipeline(
      loadFixture("edge-no-garbage.json") as Parameters<typeof runAnalysisPipeline>[0],
    ) as AnalysisResult;
    expect(result.dataQuality.removedFrames).toBe(0);
    expect(result.dataQuality.totalFrames).toBe(result.dataQuality.validFrames);
  });

  test("all-corrupted fixture removes every frame", () => {
    const result = runAnalysisPipeline(
      loadFixture("edge-all-corrupted.json") as Parameters<typeof runAnalysisPipeline>[0],
    ) as AnalysisResult;
    expect(result.dataQuality.validFrames).toBe(0);
    expect(result.dataQuality.removedFrames).toBe(result.dataQuality.totalFrames);
    expect(result.laps).toEqual([]);
    expect(result.corners).toEqual([]);
    expect(result.radioCall).toBeDefined();
  });
});