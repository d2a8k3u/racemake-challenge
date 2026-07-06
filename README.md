# Racemake telemetry service

A Bun + Hono service that turns a raw telemetry stint into a race engineer's read: corrupt frames, real lap count and times, corner map, time-loss localization, and a grounded radio call.

## Run

```bash
# install
bun install

# CLI — analyze a stint file, print JSON to stdout
bun run src/index.ts stint.telemetry.json
bun run src/index.ts stint.telemetry.json --out=result.json

# server — POST the stint JSON to /analysis
bun run src/index.ts              # http://localhost:3000
curl -s localhost:3000/analysis -H 'Content-Type: application/json' -d @stint.telemetry.json

# tests
bun test
```

## The solution

### Recorder finding
`recorder.rs` encodes tyre core temperatures as `(celsius * 10.0) as i16` — a fixed-point scale of 10 stored in a signed 16-bit int. Raw values like `873` are not Kelvin or Fahrenheit; they're 87.3 °C. Every other field (`spd`, `thr`, `brk`, `str`, `gear`, `rpm`, `pos`) is passed through as-is. `src/ingestion/parse.ts` divides the four tyre fields by `TYRE_TEMP_SCALE = 10.0` during decode; the pipeline reports this back as `recorderFinding` with a raw/decoded example so the caller can verify. Computing on the raw i16 would have produced ~870 °C tyres and silently broken any thermal analysis downstream.

### Stream cleaning
Three classes of bad frame are removed before anything is computed (`src/services/cleaning.ts`):
- **Physical bounds**: `spd > 400 km/h` or `rpm > 20000` — values the car cannot produce, almost certainly encoder/wire corruption.
- **Temporal jumps**: `|spd[i] - spd[i-1]| > 100 km/h` between consecutive frames — at ~16 ms frame spacing that's >6000 km/h·s of acceleration, physically impossible and characteristic of a dropped/corrupt sample rather than real braking.

After removal, **dropouts** (gaps in the wall-clock timeline) are detected: any inter-frame gap larger than `max(500 ms, 5 × median interval)` is flagged. Frame-rate stats (mean/median/stdev/min/max) are reported so the caller can see the stream is not at a stable rate.

### Lap detection and "real" laps
Frames are grouped by the recorder's `lap` field (`src/services/laps.ts`). Each group is classified:
- **out-lap** — starts at `pos > 0.1` (joined mid-lap from pit lane)
- **in-lap** — ends at `pos < 0.9` or final speed `< 5 km/h` (pitted before the line)
- **full** — everything else, a complete racing lap

Lap time is reported two ways: `rawLapTimeMs` (wall-clock first-to-last frame) and `adjustedLapTimeMs` (raw minus summed dropout gaps). Best lap is the fastest *adjusted* time among clean (dropout-free) full laps; worst lap is the slowest *raw* time among full laps. Ranking worst by raw time is deliberate — a dropout-heavy lap has an inflated adjusted time, so using adjusted would make the gap-ridden lap look artificially slow and mis-crown it as worst.

### Corner detection
Corners are detected from **steering angle, not brake** (`src/services/corners.ts`). The brief calls this out explicitly: the fastest corners are taken flat or with a lift, so a brake-keyed detector misses exactly the corners that matter most. Steering angle is a property of the track geometry — the wheel has to turn to follow the road regardless of how the driver modulates speed.

Per lap:
1. Take `|steering|`, smooth with a 7-frame moving average.
2. Compute an **adaptive threshold** from straight-line frames only (frames where `|str| < 5°`, `brk < 0.05`, `thr > 0.9`). Threshold = `max(15°, median + 20 × stdev)` of straight-frame steering. The 15° floor filters micro-corrections; the data-driven term adapts to car/setup steering ratio.
3. Find peaks above threshold, merging peaks within 0.02 lap-position.

**Consensus across laps** is what makes a corner a property of the track rather than the driver. Peaks from all full racing laps are pooled and clustered by lap-position (clusters separated by > 0.03). A cluster is kept as a corner only if it appears on ≥ 2 laps (or on the single lap, if that's all there is). `consensusStrength = detectedOnLaps / totalLaps` drives a `high/medium/low` confidence. Because clustering is on **position**, not on where the driver braked or slowed, the same physical corner comes out as the same corner whether it was driven hard on the brakes or taken nearly flat — which is the exact case the brief says a naive detector gets wrong.

Entry/apex/exit are derived from the steering profile of a representative lap around the apex position: the zone boundary is where `|steering|` drops below 30% of the corner's peak steering, walking backward (entry) and forward (exit) from the apex.

### Time-loss localization
Time loss is computed in the **position domain**, not the time domain (`src/services/timeloss.ts`). For the best and worst lap, each frame becomes a `(pos, cumulative_time)` pair. At every corner's entry/apex/exit positions, time is interpolated for both laps. Per-corner delta:
- `entryDeltaS = (worst.apex - worst.entry) - (best.apex - best.entry)` — how much longer the worst lap took to get from entry to apex.
- `exitDeltaS` — apex-to-exit, same form.
- `totalDeltaS = entryDeltaS + exitDeltaS`.

The corner with the largest `|totalDeltaS|` is flagged `isWorstCorner`. A sanity check verifies `sum(corner totals) ≈ totalLapDelta` so the attribution can't silently lose or invent time. Each corner also carries a `rootCause` block: min speed, max brake, min throttle, max steering, min gear, and entry tyre temps for both laps plus their deltas — so "why" is answerable from concrete numbers, not adjectives. A `hasGap` flag is set on any corner whose frame range contains a telemetry dropout, so a gap-driven delta is never presented as a driver error.

### Radio call
The radio call (`src/services/radio.ts`) is assembled from the time-loss and root-cause metrics, **not generated by an LLM from a free prompt**. Every number that appears in the message is produced by a dedicated formatter (`fmtSpeed`, `fmtBrake`, `fmtGear`, `fmtTemp`, …) and the *same* formatter writes the matching entry into a `traceability` array. That invariant — one formatter feeds both the prose and the evidence list — is what prevents an invented corner or a hallucinated speed. Confidence flags (`gap detected in telemetry`, `single lap detection`) are appended when the underlying data warrants them, so the call says "low confidence" instead of bluffing.

## What the data showed

Run against the supplied stint (`stint.telemetry.json`):

- **7195 frames** in, **1 garbage frame removed** (a sample at ts=199318 reporting spd=4021 km/h / rpm=64510 — wire corruption, not a car). **1 dropout** detected on Lap 1: a 2672 ms gap mid-lap (pos 0.50 → 0.55). That lap is flagged and excluded from best/worst ranking.
- **4 full racing laps** (Laps 1–4), plus an out-lap (Lap 0) and an in-lap (Lap 5). Best lap: **Lap 2, 73.459 s**. Worst lap: **Lap 3, 73.978 s**. Delta: **0.519 s**.
- **7 corners** detected (C1–C7), all high confidence — every corner appeared on all 4 racing laps, so consensus strength is 1.0.
- **The loss is concentrated at C2.** C2 is a fast left-hander at apex pos 0.205. Laps 1, 2 and 4 took it flat: minimum speed 213–214 km/h, brake ≤ 0.01, 6th gear, throttle never below 0.82. Lap 3 braked it: speed bled to 177 km/h, brake 0.45, downshift to 5th, throttle to zero. **0.383 s of the 0.519 s total lap delta came from this one corner.** The sanity check confirms the per-corner deltas sum to ~0.466 s against the 0.519 s lap delta (the remainder is spread across the straights between corners).
- **Tyre temperatures explain the brake.** Front-left entry temp on the worst lap was 117 °C vs 95 °C on the best lap — **+22 °C**. All four corners were hotter on Lap 3 (FL +22, FR +21, RL +10, RR +10). The driver backed out of C2 on a hot, over-pressured front-left.
- **Radio call produced by the pipeline:**
  > "Lost 0.519s total — most of it (0.383) at C2 (apex pos 0.205). Best lap (Lap 2) was flat at 214 km/h, worst lap (Lap 3) braked 0.45 in 5th gear at 177 km/h. Tyres 117°C (+22°C FL)."

## Architecture

```
stint.json
   │
   ▼
ingestion (schema.ts → parse.ts)      validate + decode (tyres ÷ 10)
   │
   ▼
cleaning.ts                           drop bad frames, find dropouts, frame-rate stats
   │
   ▼
laps.ts                               group by lap, classify out/in/full, best & worst
   │
   ▼
corners.ts                            steering peaks → cross-lap consensus → entry/apex/exit
   │
   ▼
timeloss.ts                           position-domain delta per corner, root-cause metrics
   │
   ▼
radio.ts                              grounded message + traceability + confidence flags
   │
   ▼
analysis.json
```

## Key design decisions

- **Position-domain time delta.** Comparing best vs worst at matched track positions (interpolated) isolates *where* time was lost on track. Time-domain comparison would conflate position shifts with pace differences.
- **Two lap-time measures.** Raw wall-clock for ranking the worst lap (dropouts inflate adjusted time and would mis-rank); adjusted for ranking the best (so a dropout doesn't make a genuinely fast lap look slow). Both are reported.
- **Sanity check on attribution.** `sum(cornerDeltas) ≈ totalLapDelta` is asserted in every response — if per-corner attribution doesn't add up to the lap delta, the `sanityCheck.passed` flag is `false` and the caller knows not to trust the split.
- **Untrusted input throughout.** Frames are sorted by timestamp defensively, NaNs are guarded, schema validation rejects malformed input at the route boundary, and the recorder's fixed-point encoding is reversed before any computation.