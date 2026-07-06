import { expect, test, describe, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import type { WireFrame } from "../src/types/telemetry";
import type { AnalysisResult } from "../src/types/analysis";

const PROJECT_ROOT = join(import.meta.dir, "..");
const INDEX_TS = join(PROJECT_ROOT, "src", "index.ts");

const TYRE_SCALE = 10;
const LAP_FRAMES = 60;

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
  const lap1 = buildLapFrames(1, LAP_FRAMES, 0, 50, 210);
  const lap2 = buildLapFrames(2, LAP_FRAMES, lap1[lap1.length - 1].ts + 55, 55, 205);
  const lap3 = buildLapFrames(3, LAP_FRAMES, lap2[lap2.length - 1].ts + 60, 60, 195);
  const frames = [...lap1, ...lap2, ...lap3];
  return {
    schema: "racemake.telemetry.stint.v1",
    frame_count: frames.length,
    frames,
  };
}

const VALID_STINT = buildThreeLapStint();

interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[]): Promise<CliResult> {
  const proc = Bun.spawn(["bun", "run", INDEX_TS, ...args], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function writeTempFile(dir: string, name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content, "utf-8");
  return path;
}

describe("CLI mode", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  test("outputs valid AnalysisResult JSON to stdout for valid telemetry file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "racemake-cli-"));
    const inputPath = await writeTempFile(tempDir, "stint.json", JSON.stringify(VALID_STINT));

    const result = await runCli([inputPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const parsed: AnalysisResult = JSON.parse(result.stdout);
    expect(parsed.recorderFinding).toBeDefined();
    expect(parsed.dataQuality.totalFrames).toBe(VALID_STINT.frame_count);
    expect(parsed.dataQuality.validFrames).toBeGreaterThan(0);
    expect(parsed.laps).toHaveLength(3);
    expect(parsed.corners).toBeDefined();
    expect(parsed.timeLoss).toBeDefined();
    expect(parsed.radioCall).toBeDefined();
  });

  test("writes result to file when --out flag is provided", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "racemake-cli-"));
    const inputPath = await writeTempFile(tempDir, "stint.json", JSON.stringify(VALID_STINT));
    const outputPath = join(tempDir, "result.json");

    const result = await runCli([inputPath, `--out=${outputPath}`]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");

    const fileContent = await readFile(outputPath, "utf-8");
    const parsed: AnalysisResult = JSON.parse(fileContent);
    expect(parsed.recorderFinding).toBeDefined();
    expect(parsed.laps).toHaveLength(3);
  });

  test("exits with code 1 and stderr message when file not found", async () => {
    const result = await runCli(["/nonexistent/path/to/file.json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stdout).toBe("");
  });

  test("exits with code 1 and stderr message when file contains invalid JSON", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "racemake-cli-"));
    const inputPath = await writeTempFile(tempDir, "bad.json", "{ this is not valid json }");

    const result = await runCli([inputPath]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stdout).toBe("");
  });

  test("exits with code 1 and stderr message when telemetry data fails schema validation", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "racemake-cli-"));
    const inputPath = await writeTempFile(
      tempDir,
      "invalid.json",
      JSON.stringify({ schema: "wrong", frames: [] }),
    );

    const result = await runCli([inputPath]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stdout).toBe("");
  });
});