export type WireTyres = {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
};

export type WireFrame = {
  ts: number;
  lap: number;
  pos: number;
  spd: number;
  thr: number;
  brk: number;
  str: number;
  gear: number;
  rpm: number;
  tyres: WireTyres;
};

export type ParsedStint = {
  schema: string;
  recorder?: { name: string; version: string };
  session_id?: string;
  note?: string;
  frame_count: number;
  frames: WireFrame[];
};

export type DecodedTyres = {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
};

export type DecodedFrame = {
  ts: number;
  lap: number;
  pos: number;
  spd: number;
  thr: number;
  brk: number;
  str: number;
  gear: number;
  rpm: number;
  tyres: DecodedTyres;
};

export type CleanedFrame = DecodedFrame;
