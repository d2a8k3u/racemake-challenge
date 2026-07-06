import { expect, test, describe } from "bun:test";
import { findPeaks } from "../src/utils/peakdetect";

describe("findPeaks", () => {
  test("finds a single local maximum above threshold", () => {
    const values = [
      { pos: 0, magnitude: 0 },
      { pos: 0.25, magnitude: 0.3 },
      { pos: 0.5, magnitude: 0.9 },
      { pos: 0.75, magnitude: 0.3 },
      { pos: 1, magnitude: 0 },
    ];
    const peaks = findPeaks(values, 0.2, 0.1);
    expect(peaks).toHaveLength(1);
    expect(peaks[0].pos).toBeCloseTo(0.5, 6);
    expect(peaks[0].magnitude).toBeCloseTo(0.9, 6);
  });

  test("finds multiple distinct peaks", () => {
    const values = [
      { pos: 0, magnitude: 0 },
      { pos: 0.2, magnitude: 0.8 },
      { pos: 0.4, magnitude: 0.1 },
      { pos: 0.6, magnitude: 0.9 },
      { pos: 0.8, magnitude: 0.05 },
      { pos: 1, magnitude: 0 },
    ];
    const peaks = findPeaks(values, 0.2, 0.05);
    expect(peaks).toHaveLength(2);
    expect(peaks[0].pos).toBeCloseTo(0.2, 6);
    expect(peaks[1].pos).toBeCloseTo(0.6, 6);
  });

  test("returns peaks sorted by pos", () => {
    const values = [
      { pos: 0, magnitude: 0 },
      { pos: 0.6, magnitude: 0.9 },
      { pos: 0.8, magnitude: 0.05 },
      { pos: 0.2, magnitude: 0.8 },
      { pos: 0.4, magnitude: 0.1 },
      { pos: 1, magnitude: 0 },
    ];
    const peaks = findPeaks(values, 0.2, 0.05);
    expect(peaks.map((p) => p.pos)).toEqual(
      [...peaks.map((p) => p.pos)].sort((a, b) => a - b),
    );
  });

  test("filters out peaks below threshold", () => {
    const values = [
      { pos: 0, magnitude: 0 },
      { pos: 0.25, magnitude: 0.1 },
      { pos: 0.5, magnitude: 0.95 },
      { pos: 0.75, magnitude: 0.1 },
      { pos: 1, magnitude: 0 },
    ];
    const peaks = findPeaks(values, 0.5, 0.05);
    expect(peaks).toHaveLength(1);
    expect(peaks[0].pos).toBeCloseTo(0.5, 6);
  });

  test("returns empty when all values are below threshold", () => {
    const values = [
      { pos: 0, magnitude: 0.05 },
      { pos: 0.5, magnitude: 0.1 },
      { pos: 1, magnitude: 0.05 },
    ];
    expect(findPeaks(values, 0.5, 0.05)).toEqual([]);
  });

  test("merges peaks within mergeDistance (keeps higher)", () => {
    const values = [
      { pos: 0, magnitude: 0 },
      { pos: 0.2, magnitude: 0.6 },
      { pos: 0.25, magnitude: 0.9 },
      { pos: 0.3, magnitude: 0.6 },
      { pos: 0.5, magnitude: 0 },
    ];
    const peaks = findPeaks(values, 0.2, 0.2);
    expect(peaks).toHaveLength(1);
    expect(peaks[0].pos).toBeCloseTo(0.25, 6);
    expect(peaks[0].magnitude).toBeCloseTo(0.9, 6);
  });

  test("does not merge peaks farther than mergeDistance", () => {
    const values = [
      { pos: 0, magnitude: 0 },
      { pos: 0.2, magnitude: 0.8 },
      { pos: 0.4, magnitude: 0.1 },
      { pos: 0.7, magnitude: 0.8 },
      { pos: 1, magnitude: 0 },
    ];
    const peaks = findPeaks(values, 0.2, 0.2);
    expect(peaks).toHaveLength(2);
  });

  test("returns empty for empty input", () => {
    expect(findPeaks([], 0.2, 0.1)).toEqual([]);
  });

  test("returns empty for single element", () => {
    expect(findPeaks([{ pos: 0.5, magnitude: 0.9 }], 0.2, 0.1)).toEqual([]);
  });

  test("returns empty for two elements (no interior local max)", () => {
    expect(
      findPeaks(
        [
          { pos: 0, magnitude: 0.5 },
          { pos: 1, magnitude: 0.9 },
        ],
        0.2,
        0.1,
      ),
    ).toEqual([]);
  });

  test("returns empty for flat signal", () => {
    const values = Array.from({ length: 5 }, (_, i) => ({
      pos: i / 4,
      magnitude: 0.5,
    }));
    expect(findPeaks(values, 0.2, 0.1)).toEqual([]);
  });

  test("handles plateau: single plateau peak counts as one local max", () => {
    const values = [
      { pos: 0, magnitude: 0 },
      { pos: 0.2, magnitude: 0.9 },
      { pos: 0.4, magnitude: 0.9 },
      { pos: 0.6, magnitude: 0 },
    ];
    const peaks = findPeaks(values, 0.2, 0.05);
    expect(peaks).toHaveLength(1);
    expect(peaks[0].magnitude).toBeCloseTo(0.9, 6);
  });

  test("threshold boundary: peak strictly greater than threshold passes", () => {
    const values = [
      { pos: 0, magnitude: 0 },
      { pos: 0.5, magnitude: 0.5 },
      { pos: 1, magnitude: 0 },
    ];
    expect(findPeaks(values, 0.5, 0.05)).toEqual([]);
  });

  test("merges across a small valley when mergeDistance is large", () => {
    const values = [
      { pos: 0, magnitude: 0 },
      { pos: 0.2, magnitude: 0.7 },
      { pos: 0.4, magnitude: 0.3 },
      { pos: 0.6, magnitude: 0.8 },
      { pos: 1, magnitude: 0 },
    ];
    const peaks = findPeaks(values, 0.2, 0.5);
    expect(peaks).toHaveLength(1);
    expect(peaks[0].pos).toBeCloseTo(0.6, 6);
  });
});