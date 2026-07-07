import { Hono } from "hono";
import type { z } from "zod";
import { buildRecorderFinding, decodeStint, parseStint } from "../ingestion/parse";
import { ParsedStintSchema } from "../ingestion/schema";
import { cleanFrames } from "../services/cleaning";
import { detectCorners } from "../services/corners";
import { detectLaps, selectBestAndWorstLaps } from "../services/laps";
import { generateRadioCall } from "../services/radio";
import { analyzeTimeLoss } from "../services/timeloss";
import type { AnalysisResult } from "../types/analysis";
import { framesForLap } from "../utils/frames";

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
