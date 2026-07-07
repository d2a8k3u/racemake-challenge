import type { RecorderFinding } from "../types/analysis";
import type { DecodedFrame, DecodedTyres } from "../types/telemetry";
import type { ParsedStint, WireFrame, WireTyres } from "./schema";
import { ParsedStintSchema } from "./schema";

// From recorder.rs: scales::TEMPERATURE = 10.0; tyres encoded as (celsius * 10.0) as i16.
export const TYRE_TEMP_SCALE = 10.0;

export function parseStint(raw: unknown): ParsedStint {
  return ParsedStintSchema.parse(raw);
}

export function decodeTyres(raw: WireTyres): DecodedTyres {
  return {
    fl: raw.fl / TYRE_TEMP_SCALE,
    fr: raw.fr / TYRE_TEMP_SCALE,
    rl: raw.rl / TYRE_TEMP_SCALE,
    rr: raw.rr / TYRE_TEMP_SCALE,
  };
}

export function decodeFrame(frame: WireFrame): DecodedFrame {
  return {
    ts: frame.ts,
    lap: frame.lap,
    pos: frame.pos,
    spd: frame.spd,
    thr: frame.thr,
    brk: frame.brk,
    str: frame.str,
    gear: frame.gear,
    rpm: frame.rpm,
    tyres: decodeTyres(frame.tyres),
  };
}

export function decodeStint(stint: ParsedStint): DecodedFrame[] {
  return stint.frames.map(decodeFrame);
}

export function buildRecorderFinding(parsedStint: ParsedStint): RecorderFinding {
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
