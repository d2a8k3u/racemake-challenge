import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WireFrame } from "../../src/types/telemetry";

const FIXTURES_DIR = join(import.meta.dir);
const TYRE_RAW = 900;

function straightFrame(lap: number, pos: number, ts: number, spd: number = 200): WireFrame {
  return {
    ts,
    lap,
    pos,
    spd,
    thr: 0.95,
    brk: 0,
    str: 0,
    gear: 4,
    rpm: 6000,
    tyres: { fl: TYRE_RAW, fr: TYRE_RAW, rl: TYRE_RAW, rr: TYRE_RAW },
  };
}

function cornerFrame(
  lap: number,
  pos: number,
  ts: number,
  str: number,
  spd: number = 120,
): WireFrame {
  return {
    ts,
    lap,
    pos,
    spd,
    thr: 0.6,
    brk: 0,
    str,
    gear: 3,
    rpm: 5000,
    tyres: { fl: TYRE_RAW, fr: TYRE_RAW, rl: TYRE_RAW, rr: TYRE_RAW },
  };
}

function buildFullLap(
  lapNumber: number,
  frameCount: number,
  baseTs: number,
  intervalMs: number,
): WireFrame[] {
  return Array.from({ length: frameCount }, (_, i) => {
    const pos = i / (frameCount - 1);
    const cornerCenter = 0.35;
    const cornerWidth = 0.06;
    const peakStr = 35;
    const dist = Math.abs(pos - cornerCenter);
    if (dist < cornerWidth) {
      const str = peakStr * Math.cos((dist / cornerWidth) * (Math.PI / 2));
      return cornerFrame(lapNumber, pos, baseTs + i * intervalMs, str);
    }
    return straightFrame(lapNumber, pos, baseTs + i * intervalMs);
  });
}

function writeFixture(name: string, data: unknown): void {
  writeFileSync(join(FIXTURES_DIR, name), JSON.stringify(data, null, 2));
}

// edge-empty.json — empty frames array
writeFixture("edge-empty.json", {
  schema: "racemake.telemetry.stint.v1",
  frame_count: 0,
  frames: [],
});

// edge-single-frame.json — exactly one frame
writeFixture("edge-single-frame.json", {
  schema: "racemake.telemetry.stint.v1",
  frame_count: 1,
  frames: [straightFrame(1, 0.0, 0)],
});

// edge-single-lap.json — one full racing lap (single lap, full pos range)
const singleLap = buildFullLap(1, 60, 0, 100);
writeFixture("edge-single-lap.json", {
  schema: "racemake.telemetry.stint.v1",
  frame_count: singleLap.length,
  frames: singleLap,
});

// edge-no-garbage.json — clean data, no garbage frames. Two full laps, no
// out-of-bounds values, so removedFrames should be 0.
const cleanLap1 = buildFullLap(1, 60, 0, 100);
const cleanLap2 = buildFullLap(2, 60, cleanLap1[cleanLap1.length - 1].ts + 200, 110);
writeFixture("edge-no-garbage.json", {
  schema: "racemake.telemetry.stint.v1",
  frame_count: cleanLap1.length + cleanLap2.length,
  frames: [...cleanLap1, ...cleanLap2],
});

// edge-all-corrupted.json — every frame has spd > 400, so all are removed
const corruptedFrames = Array.from({ length: 10 }, (_, i) => straightFrame(1, i / 9, i * 100, 500));
writeFixture("edge-all-corrupted.json", {
  schema: "racemake.telemetry.stint.v1",
  frame_count: corruptedFrames.length,
  frames: corruptedFrames,
});

console.log("wrote edge-case fixtures");
