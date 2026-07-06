export interface RecorderFinding {
  field: string;
  description: string;
  scaleFactor: number;
  example: { raw: number; decoded: number; unit: string };
}

export interface RemovedFrameDetail {
  ts: number;
  reason: string;
  values: Record<string, number>;
}

export interface DropoutDetail {
  lap: number;
  tsBefore: number;
  tsAfter: number;
  gapMs: number;
  posBefore: number;
  posAfter: number;
}

export interface DataQuality {
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
}

export interface LapReport {
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
}

export interface DetectedCorner {
  cornerId: string;
  positionRange: { entry: number; apex: number; exit: number };
  direction: "left" | "right";
  peakSteeringDeg: number;
  consensusStrength: number;
  detectedOnLaps: number[];
  confidence: "high" | "medium" | "low";
}

export type CornerPhase = "entry" | "apex" | "exit";

export interface CornerDelta {
  cornerId: string;
  totalDeltaS: number;
  entryDeltaS: number;
  apexDeltaS: number;
  exitDeltaS: number;
  isWorstCorner: boolean;
  significance: "none" | "low" | "high";
  hasGap: boolean;
}

export interface CornerMetrics {
  minSpeedKmh: number;
  maxBrake: number;
  minThrottle: number;
  maxSteeringDeg: number;
  minGear: number;
  tyreTempEntryC: { fl: number; fr: number; rl: number; rr: number };
}

export interface MetricDeltas {
  speedDeltaKmh: number;
  brakeDelta: number;
  throttleDelta: number;
  steeringDeltaDeg: number;
  gearDelta: number;
  tyreTempDeltaC: { fl: number; fr: number; rl: number; rr: number };
}

export interface RootCauseMetrics {
  bestLap: CornerMetrics;
  worstLap: CornerMetrics;
  deltas: MetricDeltas;
}

export interface RootCause {
  cornerId: string;
  metrics: RootCauseMetrics;
  explanation: string;
}

export interface TimeLossReport {
  bestLap: number;
  worstLap: number;
  bestLapTimeS: number;
  worstLapTimeS: number;
  totalDeltaS: number;
  cornerDeltas: CornerDelta[];
  rootCause: RootCause;
  sanityCheck: { sumOfCornerDeltasS: number; totalDeltaS: number; passed: boolean };
}

export interface TraceabilityEntry {
  claim: string;
  source: string;
  value: string;
}

export interface RadioCall {
  message: string;
  traceability: TraceabilityEntry[];
  confidenceFlags: string[];
}

export interface AnalysisResult {
  recorderFinding: RecorderFinding;
  dataQuality: DataQuality;
  laps: LapReport[];
  corners: DetectedCorner[];
  timeLoss: TimeLossReport;
  radioCall: RadioCall;
}
