import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { runAnalysisPipeline } from "../../src/routes/analysis";
import type { WireFrame } from "../../src/types/telemetry";

const TYRE_SCALE = 10;
const FRAME_COUNT = 121;
const INTERVAL_MS = 100;
const STRAIGHT_SPEED = 210;
const CORNER_SPEED = 120;

// Five designed corner positions, alternating direction.
// Right = positive steering, Left = negative steering.
const CORNERS = [
  { center: 0.10, width: 0.05, peak: 35, direction: 1 },
  { center: 0.25, width: 0.05, peak: -40, direction: -1 },
  { center: 0.45, width: 0.06, peak: 38, direction: 1 },
  { center: 0.65, width: 0.05, peak: -36, direction: -1 },
  { center: 0.85, width: 0.05, peak: 42, direction: 1 },
];

// Per-lap base interval (ms). Smaller interval = faster lap. Lap 1 fastest,
// lap 4 slowest, so raw lap times genuinely differ and best/worst detection
// ranks them correctly. Lap 2 is slightly slower than lap 3 on straight pace
// but the braking at corner 2 makes it the worst overall.
const LAP_INTERVAL_MS = [50, 58, 55, 60];

function cornerSteering(pos: number): number {
  let str = 0;
  for (const c of CORNERS) {
    const dist = Math.abs(pos - c.center);
    if (dist < c.width) {
      str += c.peak * Math.cos((dist / c.width) * (Math.PI / 2));
    }
  }
  return str;
}

function isCornerPos(pos: number, cornerIndex: number): boolean {
  const c = CORNERS[cornerIndex];
  return Math.abs(pos - c.center) < c.width;
}

function speedAt(pos: number): number {
  let inCorner = false;
  for (let i = 0; i < CORNERS.length; i++) {
    if (isCornerPos(pos, i)) {
      inCorner = true;
      break;
    }
  }
  return inCorner ? CORNER_SPEED : STRAIGHT_SPEED;
}

// Lap 2 drives corner 2 (index 1) differently: brakes into it instead of
// just lifting. This is what makes it the worst lap.
function brakeAt(pos: number, lapIndex: number): number {
  if (lapIndex === 1 && isCornerPos(pos, 1)) {
    return 0.5;
  }
  return 0;
}

function throttleAt(pos: number, lapIndex: number): number {
  if (lapIndex === 1 && isCornerPos(pos, 1)) {
    return 0.2;
  }
  let inCorner = false;
  for (let i = 0; i < CORNERS.length; i++) {
    if (isCornerPos(pos, i)) {
      inCorner = true;
      break;
    }
  }
  return inCorner ? 0.6 : 0.95;
}

function buildLap(lapNumber: number, lapIndex: number, baseTs: number): WireFrame[] {
  const interval = LAP_INTERVAL_MS[lapIndex];
  return Array.from({ length: FRAME_COUNT }, (_, i) => {
    const pos = i / (FRAME_COUNT - 1);
    return {
      ts: baseTs + i * interval,
      lap: lapNumber,
      pos,
      spd: speedAt(pos),
      thr: throttleAt(pos, lapIndex),
      brk: brakeAt(pos, lapIndex),
      str: cornerSteering(pos),
      gear: 4,
      rpm: 6000,
      tyres: { fl: 900, fr: 900, rl: 900, rr: 900 },
    };
  });
}

function buildStint() {
  const laps: WireFrame[] = [];
  let baseTs = 0;
  for (let lapIndex = 0; lapIndex < 4; lapIndex++) {
    const interval = LAP_INTERVAL_MS[lapIndex];
    const lap = buildLap(lapIndex + 1, lapIndex, baseTs);
    laps.push(...lap);
    baseTs = lap[lap.length - 1].ts + interval * 2;
  }
  return {
    schema: "racemake.telemetry.stint.v1",
    recorder: { name: "synthetic-generator", version: "1.0.0" },
    session_id: "synthetic-5corner-test",
    note: "synthetic 4-lap stint with 5 corners; lap 2 brakes into corner 2",
    frame_count: laps.length,
    frames: laps,
  };
}

const stint = buildStint();

// Validate against the pipeline before writing the fixture.
const result = runAnalysisPipeline(stint);
console.log("corners detected:", result.corners.length);
console.log("corner apexes:", result.corners.map((c) => c.positionRange.apex.toFixed(3)).join(", "));
console.log("lap count:", result.laps.length, "full racing laps:", result.laps.filter((l) => l.isFullRacingLap).length);
console.log("best lap:", result.timeLoss.bestLap, "worst lap:", result.timeLoss.worstLap);
console.log("total delta:", result.timeLoss.totalDeltaS);
console.log("removed frames:", result.dataQuality.removedFrames);

if (result.corners.length !== 5) {
  console.error("FAIL: expected 5 corners, got", result.corners.length);
  process.exit(1);
}

const fixturesDir = import.meta.dir;
mkdirSync(fixturesDir, { recursive: true });
writeFileSync(join(fixturesDir, "synthetic-5corner.json"), JSON.stringify(stint, null, 2));
console.log("wrote synthetic-5corner.json");