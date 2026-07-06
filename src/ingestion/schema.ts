import { z } from "zod";

export const WireTyresSchema = z.object({
  fl: z.number(),
  fr: z.number(),
  rl: z.number(),
  rr: z.number(),
});

export const WireFrameSchema = z.object({
  ts: z.number(),
  lap: z.number(),
  pos: z.number(),
  spd: z.number(),
  thr: z.number(),
  brk: z.number(),
  str: z.number(),
  gear: z.number(),
  rpm: z.number(),
  tyres: WireTyresSchema,
});

export const ParsedStintSchema = z.object({
  schema: z.string(),
  recorder: z.object({ name: z.string(), version: z.string() }).optional(),
  session_id: z.string().optional(),
  note: z.string().optional(),
  frame_count: z.number(),
  frames: z.array(WireFrameSchema),
});

export type WireTyres = z.infer<typeof WireTyresSchema>;
export type WireFrame = z.infer<typeof WireFrameSchema>;
export type ParsedStint = z.infer<typeof ParsedStintSchema>;