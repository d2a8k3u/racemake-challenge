import { describe, expect, test } from "bun:test";
import { decodeFrame, decodeStint, decodeTyres, parseStint } from "../src/ingestion/parse";
import { ParsedStintSchema, WireFrameSchema } from "../src/ingestion/schema";
import type { WireTyres } from "../src/types/telemetry";
import sampleStintRaw from "../stint.telemetry.json";

const validFrame = {
  ts: 48,
  lap: 0,
  pos: 0.4,
  spd: 55.2,
  thr: 1,
  brk: 0,
  str: 0.2,
  gear: 2,
  rpm: 8716,
  tyres: { fl: 579, fr: 551, rl: 574, rr: 541 },
};

const validStint = {
  schema: "racemake.telemetry.stint.v1",
  recorder: { name: "racemake-agent", version: "0.1.2874" },
  session_id: "7f3a9c1e-0b52-4d84-9a6e-2c1d5f8b41a0",
  note: "raw frames as streamed by the native recorder",
  frame_count: 1,
  frames: [validFrame],
};

describe("Zod schemas", () => {
  test("WireFrameSchema accepts a well-formed frame", () => {
    const result = WireFrameSchema.safeParse(validFrame);
    expect(result.success).toBe(true);
  });

  test("WireFrameSchema rejects a frame missing tyres", () => {
    const { tyres: _omit, ...missing } = validFrame;
    const result = WireFrameSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  test("WireFrameSchema rejects wrong types (ts as string)", () => {
    const result = WireFrameSchema.safeParse({ ...validFrame, ts: "not-a-number" });
    expect(result.success).toBe(false);
  });

  test("ParsedStintSchema accepts a well-formed stint", () => {
    const result = ParsedStintSchema.safeParse(validStint);
    expect(result.success).toBe(true);
  });

  test("ParsedStintSchema rejects a stint missing frames", () => {
    const { frames: _omit, ...missing } = validStint;
    const result = ParsedStintSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  test("ParsedStintSchema accepts a stint without optional fields", () => {
    const result = ParsedStintSchema.safeParse({
      schema: "racemake.telemetry.stint.v1",
      frame_count: 0,
      frames: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("parseStint", () => {
  test("returns a parsed stint for valid input", () => {
    const parsed = parseStint(validStint);
    expect(parsed.schema).toBe("racemake.telemetry.stint.v1");
    expect(parsed.frames).toHaveLength(1);
    expect(parsed.frames[0].tyres.fl).toBe(579);
  });

  test("throws on invalid input (missing frames)", () => {
    const { frames: _omit, ...missing } = validStint;
    expect(() => parseStint(missing)).toThrow();
  });

  test("throws on invalid input (wrong type for spd)", () => {
    const bad = {
      ...validStint,
      frames: [{ ...validFrame, spd: "fast" }],
    };
    expect(() => parseStint(bad)).toThrow();
  });

  test("throws on non-object input", () => {
    expect(() => parseStint("not an object")).toThrow();
    expect(() => parseStint(null)).toThrow();
    expect(() => parseStint(undefined)).toThrow();
  });

  test("preserves optional fields when present", () => {
    const parsed = parseStint(validStint);
    expect(parsed.recorder?.name).toBe("racemake-agent");
    expect(parsed.session_id).toBe("7f3a9c1e-0b52-4d84-9a6e-2c1d5f8b41a0");
    expect(parsed.note).toBe("raw frames as streamed by the native recorder");
  });
});

describe("decodeTyres", () => {
  test("579 -> 57.9 (the canonical example from recorder.rs)", () => {
    const raw: WireTyres = { fl: 579, fr: 551, rl: 574, rr: 541 };
    const decoded = decodeTyres(raw);
    expect(decoded.fl).toBeCloseTo(57.9, 5);
    expect(decoded.fr).toBeCloseTo(55.1, 5);
    expect(decoded.rl).toBeCloseTo(57.4, 5);
    expect(decoded.rr).toBeCloseTo(54.1, 5);
  });

  test("handles negative encoded values (sub-zero temps)", () => {
    const raw: WireTyres = { fl: -50, fr: 0, rl: 10, rr: 905 };
    const decoded = decodeTyres(raw);
    expect(decoded.fl).toBeCloseTo(-5.0, 5);
    expect(decoded.fr).toBeCloseTo(0.0, 5);
    expect(decoded.rl).toBeCloseTo(1.0, 5);
    expect(decoded.rr).toBeCloseTo(90.5, 5);
  });
});

describe("decodeFrame", () => {
  test("preserves all scalar fields unchanged", () => {
    const decoded = decodeFrame(validFrame);
    expect(decoded.ts).toBe(48);
    expect(decoded.lap).toBe(0);
    expect(decoded.pos).toBeCloseTo(0.4, 5);
    expect(decoded.spd).toBeCloseTo(55.2, 5);
    expect(decoded.thr).toBe(1);
    expect(decoded.brk).toBe(0);
    expect(decoded.str).toBeCloseTo(0.2, 5);
    expect(decoded.gear).toBe(2);
    expect(decoded.rpm).toBe(8716);
  });

  test("decodes tyres to Celsius, leaves scalars alone", () => {
    const decoded = decodeFrame(validFrame);
    expect(decoded.tyres.fl).toBeCloseTo(57.9, 5);
    expect(decoded.tyres.fr).toBeCloseTo(55.1, 5);
    expect(decoded.tyres.rl).toBeCloseTo(57.4, 5);
    expect(decoded.tyres.rr).toBeCloseTo(54.1, 5);
  });
});

describe("decodeStint", () => {
  test("decodes every frame in a parsed stint", () => {
    const parsed = parseStint(validStint);
    const decoded = decodeStint(parsed);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].tyres.fl).toBeCloseTo(57.9, 5);
    expect(decoded[0].rpm).toBe(8716);
  });

  test("returns an empty array for an empty stint", () => {
    const parsed = parseStint({
      schema: "racemake.telemetry.stint.v1",
      frame_count: 0,
      frames: [],
    });
    expect(decodeStint(parsed)).toHaveLength(0);
  });
});

describe("integration with sample stint (first 10 frames)", () => {
  const rawFirst10 = {
    ...sampleStintRaw,
    frame_count: 10,
    frames: sampleStintRaw.frames.slice(0, 10),
  };

  test("parseStint accepts the first 10 real frames", () => {
    const parsed = parseStint(rawFirst10);
    expect(parsed.frames).toHaveLength(10);
    expect(parsed.frame_count).toBe(10);
  });

  test("decodeStint produces 10 decoded frames with correct tyre temps", () => {
    const parsed = parseStint(rawFirst10);
    const decoded = decodeStint(parsed);
    expect(decoded).toHaveLength(10);
    expect(decoded[0].tyres.fl).toBeCloseTo(57.9, 5);
    expect(decoded[0].ts).toBe(48);
    expect(decoded[0].rpm).toBe(8716);
  });

  test("frame_count in the file is consistent with frames.length", () => {
    expect(sampleStintRaw.frame_count).toBe(sampleStintRaw.frames.length);
  });
});
