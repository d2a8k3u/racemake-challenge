import { expect, test, describe } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { createApp } from "../src/server";
import type { AnalysisResult } from "../src/types/analysis";

const app = createApp();
const FIXTURES_DIR = join(import.meta.dir, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

describe("GET /health", () => {
  test("returns 200 with { status: 'ok' }", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});

describe("POST /analysis — sample telemetry", () => {
  test("returns 200 with a full AnalysisResult shape", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: loadFixture("sample-telemetry.json"),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AnalysisResult;

    expect(body.recorderFinding).toBeDefined();
    expect(body.dataQuality).toBeDefined();
    expect(body.dataQuality.totalFrames).toBe(7195);
    expect(Array.isArray(body.laps)).toBe(true);
    expect(body.laps.length).toBe(6);
    expect(Array.isArray(body.corners)).toBe(true);
    expect(body.corners.length).toBe(7);
    expect(body.timeLoss).toBeDefined();
    expect(body.timeLoss.totalDeltaS).toBeGreaterThan(0);
    expect(body.radioCall).toBeDefined();
    expect(body.radioCall.message.length).toBeGreaterThan(0);
    expect(body.radioCall.traceability.length).toBeGreaterThan(0);
  });
});

describe("POST /analysis — error handling", () => {
  test("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is not valid json }",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("returns 400 when frames field is missing", async () => {
    const res = await app.request("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema: "racemake.telemetry.stint.v1", frame_count: 0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});