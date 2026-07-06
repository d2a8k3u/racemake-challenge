import type {
  TimeLossReport,
  DetectedCorner,
  RadioCall,
  TraceabilityEntry,
} from "../types/analysis";

// --- Formatting helpers ---
// Each helper formats a numeric value into the exact string that will appear
// in both the message and the traceability `value` field.  Using the same
// helper for both guarantees that every number in the message has a matching
// traceability entry (the "no invented numbers" invariant).

function fmtDelta(s: number): string {
  return Math.abs(s).toFixed(3);
}

function fmtSpeed(kmh: number): string {
  return Math.round(kmh).toString();
}

function fmtBrake(b: number): string {
  return b.toFixed(2);
}

function fmtGear(g: number): string {
  return Math.round(g).toString();
}

function fmtTemp(c: number): string {
  return Math.round(c).toString();
}

function fmtTempDelta(d: number): string {
  return Math.round(Math.abs(d)).toString();
}

function fmtPos(p: number): string {
  return p.toFixed(3);
}

function fmtLap(n: number): string {
  return Math.round(n).toString();
}

function ordinal(n: number): string {
  const g = Math.round(n);
  if (g === 1) return "1st";
  if (g === 2) return "2nd";
  if (g === 3) return "3rd";
  return `${g}th`;
}

// --- Main entry point ---

export function generateRadioCall(
  timeLoss: TimeLossReport,
  corners: DetectedCorner[],
  bestLapNumber: number,
  worstLapNumber: number,
): RadioCall {
  const traceability: TraceabilityEntry[] = [];
  const confidenceFlags: string[] = [];

  // --- Total lap delta (leads the headline) ---
  const worstCornerDelta =
    timeLoss.cornerDeltas.find((cd) => cd.isWorstCorner) ??
    timeLoss.cornerDeltas[0];

  const lapTotalDeltaS = timeLoss.totalDeltaS;
  const lapTotalDeltaStr = fmtDelta(lapTotalDeltaS);
  const worstCornerTotalS = worstCornerDelta
    ? worstCornerDelta.totalDeltaS
    : lapTotalDeltaS;
  const worstCornerDeltaStr = fmtDelta(worstCornerTotalS);

  traceability.push({
    claim: lapTotalDeltaStr,
    source: "timeLoss.totalDeltaS",
    value: lapTotalDeltaStr,
  });
  if (worstCornerDelta !== undefined) {
    traceability.push({
      claim: worstCornerDeltaStr,
      source: "cornerDelta.totalDeltaS",
      value: worstCornerDeltaStr,
    });
  }

  // --- Lap numbers ---
  const bestLapStr = fmtLap(bestLapNumber);
  const worstLapStr = fmtLap(worstLapNumber);

  traceability.push({
    claim: bestLapStr,
    source: "bestLapNumber",
    value: bestLapStr,
  });
  traceability.push({
    claim: worstLapStr,
    source: "worstLapNumber",
    value: worstLapStr,
  });

  // --- Confidence flags ---

  // Gap flag: any corner delta reports a telemetry gap in its range.
  if (timeLoss.cornerDeltas.some((cd) => cd.hasGap)) {
    confidenceFlags.push("gap detected in telemetry");
  }

  // Single-lap flag: corners were only seen on one lap (or not at all).
  if (
    corners.length === 0 ||
    corners.some((c) => c.detectedOnLaps.length <= 1)
  ) {
    confidenceFlags.push("single lap detection");
  }

  // --- Message construction ---
  const hasCorners = corners.length > 0 && worstCornerDelta !== undefined;
  let message: string;

  if (hasCorners) {
    const worstCorner =
      corners.find((c) => c.cornerId === worstCornerDelta!.cornerId) ??
      corners[0];

    // Corner ID
    const cornerId = worstCorner.cornerId;
    traceability.push({
      claim: cornerId,
      source: "worstCorner.cornerId",
      value: cornerId,
    });

    // Apex position
    const apexPosStr = fmtPos(worstCorner.positionRange.apex);
    traceability.push({
      claim: apexPosStr,
      source: "worstCorner.positionRange.apex",
      value: apexPosStr,
    });

    // Metrics
    const bestMetrics = timeLoss.rootCause.metrics.bestLap;
    const worstMetrics = timeLoss.rootCause.metrics.worstLap;
    const deltas = timeLoss.rootCause.metrics.deltas;

    // Best lap speed
    const bestSpeedStr = fmtSpeed(bestMetrics.minSpeedKmh);
    traceability.push({
      claim: bestSpeedStr,
      source: "bestMetrics.minSpeedKmh",
      value: bestSpeedStr,
    });

    // Worst lap speed
    const worstSpeedStr = fmtSpeed(worstMetrics.minSpeedKmh);
    traceability.push({
      claim: worstSpeedStr,
      source: "worstMetrics.minSpeedKmh",
      value: worstSpeedStr,
    });

    // Best lap brake description
    let bestBrakeDesc: string;
    if (bestMetrics.maxBrake > 0.01) {
      const brakeStr = fmtBrake(bestMetrics.maxBrake);
      bestBrakeDesc = `braked ${brakeStr}`;
      traceability.push({
        claim: brakeStr,
        source: "bestMetrics.maxBrake",
        value: brakeStr,
      });
    } else {
      bestBrakeDesc = "flat";
    }

    // Worst lap brake + gear description
    let worstBrakeDesc: string;
    if (worstMetrics.maxBrake > 0.01) {
      const brakeStr = fmtBrake(worstMetrics.maxBrake);
      const gearStr = fmtGear(worstMetrics.minGear);
      worstBrakeDesc = `braked ${brakeStr} in ${ordinal(worstMetrics.minGear)} gear`;
      traceability.push({
        claim: brakeStr,
        source: "worstMetrics.maxBrake",
        value: brakeStr,
      });
      traceability.push({
        claim: gearStr,
        source: "worstMetrics.minGear",
        value: gearStr,
      });
    } else {
      worstBrakeDesc = "flat";
    }

    // Tyre temperature (front-left)
    const tyreTempStr = fmtTemp(worstMetrics.tyreTempEntryC.fl);
    traceability.push({
      claim: tyreTempStr,
      source: "worstMetrics.tyreTempEntryC.fl",
      value: tyreTempStr,
    });

    // Tyre temperature delta (front-left)
    const tyreDeltaFL = deltas.tyreTempDeltaC.fl;
    let tyreDeltaDesc: string;
    if (Math.abs(tyreDeltaFL) > 5) {
      const deltaStr = fmtTempDelta(tyreDeltaFL);
      const sign = tyreDeltaFL > 0 ? "+" : "-";
      tyreDeltaDesc = `${sign}${deltaStr}°C FL`;
      traceability.push({
        claim: deltaStr,
        source: "deltas.tyreTempDeltaC.fl",
        value: deltaStr,
      });
    } else {
      tyreDeltaDesc = "similar";
    }

    // Assemble the full message
    const headline =
      `Lost ${lapTotalDeltaStr}s total — most of it (${worstCornerDeltaStr}) at ${cornerId} (apex pos ${apexPosStr}). `;

    message =
      headline +
      `Best lap (Lap ${bestLapStr}) was ${bestBrakeDesc} at ${bestSpeedStr} km/h, ` +
      `worst lap (Lap ${worstLapStr}) ${worstBrakeDesc} at ${worstSpeedStr} km/h. ` +
      `Tyres ${tyreTempStr}°C (${tyreDeltaDesc}).`;
  } else {
    // No corners detected — concise fallback message
    message =
      `Lost ${lapTotalDeltaStr}s total between Lap ${bestLapStr} and Lap ${worstLapStr}. ` +
      `No corners detected; unable to localize time loss.`;
  }

  return { message, traceability, confidenceFlags };
}