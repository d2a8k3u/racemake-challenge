export type RecorderFinding = {
  field: string;
  description: string;
  scaleFactor: number;
  example: { raw: number; decoded: number; unit: string };
};

export type RemovedFrameDetail = {
  ts: number;
  reason: string;
  values: Record<string, number>;
};

export type DropoutDetail = {
  lap: number;
  tsBefore: number;
  tsAfter: number;
  gapMs: number;
  posBefore: number;
  posAfter: number;
};

export type DataQuality = {
  totalFrames: number;
  validFrames: number;
  removedFrames: number;
  removedFrameDetails: RemovedFrameDetail[];
  dropouts: DropoutDetail[];
  frameRate: {
    meanMs: number;
    medianMs: number;
    stdevMs: number;
    minMs: number;
    maxMs: number;
  };
};

export type LapReport = {
  lapNumber: number;
  classification: "full" | "out-lap" | "in-lap";
  frames: number;
  posStart: number;
  posEnd: number;
  rawLapTimeMs: number;
  adjustedLapTimeMs: number;
  adjustedLapTimeS: number;
  hasDropout: boolean;
  dropoutMs: number;
  isFullRacingLap: boolean;
};

export type DetectedCorner = {
  cornerId: string;
  positionRange: { entry: number; apex: number; exit: number };
  direction: "left" | "right";
  peakSteeringDeg: number;
  consensusStrength: number;
  detectedOnLaps: number[];
  confidence: "high" | "medium" | "low";
};

export type CornerPhase = "entry" | "apex" | "exit";

export type CornerDelta = {
  cornerId: string;
  totalDeltaS: number;
  entryDeltaS: number;
  apexDeltaS: number;
  exitDeltaS: number;
  isWorstCorner: boolean;
  significance: "none" | "low" | "high";
  hasGap: boolean;
};

export type CornerMetrics = {
  minSpeedKmh: number;
  maxBrake: number;
  minThrottle: number;
  maxSteeringDeg: number;
  minGear: number;
  tyreTempEntryC: { fl: number; fr: number; rl: number; rr: number };
};

export type MetricDeltas = {
  speedDeltaKmh: number;
  brakeDelta: number;
  throttleDelta: number;
  steeringDeltaDeg: number;
  gearDelta: number;
  tyreTempDeltaC: { fl: number; fr: number; rl: number; rr: number };
};

export type RootCauseMetrics = {
  bestLap: CornerMetrics;
  worstLap: CornerMetrics;
  deltas: MetricDeltas;
};

export type RootCause = {
  cornerId: string;
  metrics: RootCauseMetrics;
  explanation: string;
};

export type TimeLossReport = {
  bestLap: number;
  worstLap: number;
  bestLapTimeS: number;
  worstLapTimeS: number;
  totalDeltaS: number;
  cornerDeltas: CornerDelta[];
  rootCause: RootCause;
  sanityCheck: { sumOfCornerDeltasS: number; totalDeltaS: number; passed: boolean };
};

export type TraceabilityEntry = {
  claim: string;
  source: string;
  value: string;
};

export type RadioCall = {
  message: string;
  traceability: TraceabilityEntry[];
  confidenceFlags: string[];
};

export type AnalysisResult = {
  recorderFinding: RecorderFinding;
  dataQuality: DataQuality;
  laps: LapReport[];
  corners: DetectedCorner[];
  timeLoss: TimeLossReport;
  radioCall: RadioCall;
};
