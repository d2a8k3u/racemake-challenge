import { expect, test, describe } from "bun:test";
import { createApp } from "../src/server";
import { runAnalysisPipeline } from "../src/routes/analysis";
import type { WireFrame } from "../src/types/telemetry";
import type { AnalysisResult } from "../src/types/analysis";

const app = createApp();

const TYRE_SCALE = 10;

function frame(
  lap: number,
  i: number,
  count: number,
  baseTs: number,
  intervalMs: number,
  speedKmh: number,
  steering: number,
): WireFrame {
  return {
    ts: baseTs + i * intervalMs,
    lap,
    pos: i / (count - 1),
    spd: speedKmh,
    thr: 0.9,
    brk: 0,
    str: steering,
    gear: 4,
    rpm: 6000,
    tyres: { fl: 900, fr: 900, rl: 900, rr: 900 },
  };
}

function buildLapFrames(
  lap: number,
  count: number,
  baseTs: number,
  intervalMs: number,
  speedKmh: number,
): WireFrame[] {
  return Array.from({ length: count }, (_, i) => {
    const lapProgress = i / (count - 1);
    // A clear right-hand corner around pos 0.35 — a Gaussian-like steering peak
    const cornerCenter = 0.35;
    const cornerWidth = 0.06;
    const peakSteering = 35;
    const dist = Math.abs(lapProgress - cornerCenter);
    const steering = dist < cornerWidth
      ? peakSteering * Math.cos((dist / cornerWidth) * (Math.PI / 2))
      : 0;
    return frame(lap, i, count, baseTs, intervalMs, speedKmh, steering);
  });
}

function buildThreeLapStint(): { schema: string; frame_count: number; frames: WireFrame[] } {
  const lapCount = 60;
  // Best lap (lap 1) fastest with shortest interval, worst lap (lap 3) slowest
  // with longest interval — raw lap times genuinely differ so best/worst
  // detection ranks them correctly.
  const lap1 = buildLapFrames(1, lapCount, 0, 50, 210);
  const lap2 = buildLapFrames(2, lapCount, lap1[lap1.length - 1].ts + 55, 55, 205);
  const lap3 = buildLapFrames(3, lapCount, lap2[lap2.length - 1].ts + 60, 60, 195);
  const frames = [...lap1, ...lap2, ...lap3];
  return {
    schema: "racemake.telemetry.stint.v1",
    frame_count: frames.length,
    frames,
  };
}

const VALID_STINT = buildThreeLapStint();

describe("POST /analysis — validation", () => {
  test("returns 400 for non-JSON body", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("returns 400 for invalid telemetry (missing frames)", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema: "x", frame_count: 0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });

  test("returns 400 for wrong-typed field (spd as string)", async () => {
    const bad = {
      ...VALID_STINT,
      frames: VALID_STINT.frames.map((f, i) =>
        i === 0 ? { ...f, spd: "fast" } : f,
      ),
    };
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bad),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /analysis — success", () => {
  test("returns 200 and a complete AnalysisResult for a valid stint", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_STINT),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AnalysisResult;

    expect(body.recorderFinding).toBeDefined();
    expect(body.recorderFinding.field).toBe("tyres");
    expect(body.recorderFinding.scaleFactor).toBe(TYRE_SCALE);

    expect(body.dataQuality).toBeDefined();
    expect(body.dataQuality.totalFrames).toBe(VALID_STINT.frames.length);
    expect(body.dataQuality.validFrames).toBeGreaterThan(0);

    expect(Array.isArray(body.laps)).toBe(true);
    expect(body.laps.length).toBe(3);

    expect(Array.isArray(body.corners)).toBe(true);
    expect(body.corners.length).toBeGreaterThan(0);

    expect(body.timeLoss).toBeDefined();
    expect(body.radioCall).toBeDefined();
    expect(typeof body.radioCall.message).toBe("string");
    expect(body.radioCall.message.length).toBeGreaterThan(0);
    expect(Array.isArray(body.radioCall.traceability)).toBe(true);
  });

  test("recorderFinding example decodes the first frame's FL tyre temp", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_STINT),
    });
    const body = (await res.json()) as AnalysisResult;
    expect(body.recorderFinding.example.raw).toBe(900);
    expect(body.recorderFinding.example.decoded).toBeCloseTo(90, 5);
    expect(body.recorderFinding.example.unit).toBe("°C");
  });

  test("dataQuality counts match the cleaning result", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_STINT),
    });
    const body = (await res.json()) as AnalysisResult;
    expect(body.dataQuality.totalFrames).toBe(VALID_STINT.frames.length);
    expect(body.dataQuality.validFrames + body.dataQuality.removedFrames).toBe(
      body.dataQuality.totalFrames,
    );
  });

  test("detects at least one corner on the consensus position", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_STINT),
    });
    const body = (await res.json()) as AnalysisResult;
    const apexPositions = body.corners.map((c) => c.positionRange.apex);
    // Corner should be near pos 0.35 within a tolerance
    expect(apexPositions.some((p) => Math.abs(p - 0.35) < 0.05)).toBe(true);
  });

  test("best and worst laps differ when speeds differ across laps", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_STINT),
    });
    const body = (await res.json()) as AnalysisResult;
    // Lap 1 is fastest (210), lap 3 slowest (195)
    expect(body.timeLoss.bestLap).toBe(1);
    expect(body.timeLoss.worstLap).toBe(3);
  });
});

describe("runAnalysisPipeline — direct", () => {
  test("returns an AnalysisResult object with all top-level keys", () => {
    const result = runAnalysisPipeline(VALID_STINT);
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(
      ["corners", "dataQuality", "laps", "radioCall", "recorderFinding", "timeLoss"].sort(),
    );
  });

  test("handles an empty stint without throwing", () => {
    const empty = { schema: "racemake.telemetry.stint.v1", frame_count: 0, frames: [] };
    const result = runAnalysisPipeline(empty);
    expect(result.dataQuality.totalFrames).toBe(0);
    expect(result.laps).toEqual([]);
    expect(result.corners).toEqual([]);
    expect(result.radioCall).toBeDefined();
  });
});