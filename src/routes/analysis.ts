import { Hono } from "hono";
import { z } from "zod";
import { ParsedStintSchema } from "../ingestion/schema";
import { parseStint, decodeStint, TYRE_TEMP_SCALE } from "../ingestion/parse";
import { cleanFrames } from "../services/cleaning";
import { detectLaps, selectBestAndWorstLaps } from "../services/laps";
import { detectCorners } from "../services/corners";
import { analyzeTimeLoss } from "../services/timeloss";
import { generateRadioCall } from "../services/radio";
import type { CleanedFrame } from "../types/telemetry";
import type { AnalysisResult, RecorderFinding } from "../types/analysis";

export const analysis = new Hono();

analysis.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = ParsedStintSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid telemetry input", details: parsed.error.issues }, 400);
  }

  try {
    const result = runAnalysisPipeline(parsed.data);
    return c.json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error";
    return c.json({ error: message }, 500);
  }
});

export function runAnalysisPipeline(raw: z.infer<typeof ParsedStintSchema>): AnalysisResult {
  const parsedStint = parseStint(raw);
  const decodedFrames = decodeStint(parsedStint);

  const cleanResult = cleanFrames(decodedFrames);
  const laps = detectLaps(cleanResult.validFrames);
  const { bestLap, worstLap } = selectBestAndWorstLaps(laps);

  const fullRacingLapNumbers = laps
    .filter((lap) => lap.isFullRacingLap)
    .map((lap) => lap.lapNumber);

  const fullLapFrames = fullRacingLapNumbers.map((lapNum) =>
    cleanResult.validFrames.filter((frame) => frame.lap === lapNum),
  );

  const corners = detectCorners(fullLapFrames);

  const bestFrames = framesForLap(cleanResult.validFrames, bestLap);
  const worstFrames = framesForLap(cleanResult.validFrames, worstLap);

  const timeLoss = analyzeTimeLoss(bestFrames, worstFrames, corners);

  const radioCall = generateRadioCall(timeLoss, corners, bestLap, worstLap);

  const recorderFinding = buildRecorderFinding(parsedStint);

  return {
    recorderFinding,
    dataQuality: {
      totalFrames: decodedFrames.length,
      validFrames: cleanResult.validFrames.length,
      removedFrames: cleanResult.removedFrames.length,
      removedFrameDetails: cleanResult.removedFrames,
      dropouts: cleanResult.dropouts,
      frameRate: cleanResult.frameRate,
    },
    laps,
    corners,
    timeLoss,
    radioCall,
  };
}

function framesForLap(frames: CleanedFrame[], lapNumber: number): CleanedFrame[] {
  return frames.filter((frame) => frame.lap === lapNumber);
}

function buildRecorderFinding(parsedStint: z.infer<typeof ParsedStintSchema>): RecorderFinding {
  const firstFrame = parsedStint.frames[0];
  const rawTyre = firstFrame?.tyres.fl ?? 0;
  const decodedTyre = rawTyre / TYRE_TEMP_SCALE;

  return {
    field: "tyres",
    description: "Tyre temperatures are encoded as (celsius × 10) as i16",
    scaleFactor: TYRE_TEMP_SCALE,
    example: { raw: rawTyre, decoded: decodedTyre, unit: "°C" },
  };
}