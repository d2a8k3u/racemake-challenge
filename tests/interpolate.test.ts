import { describe, expect, test } from "bun:test";
import {
  interpolateTimeAtPos,
  linearInterpolate,
  resampleToPosGrid,
} from "../src/utils/interpolate";

describe("linearInterpolate", () => {
  test("interpolates midpoint correctly", () => {
    expect(linearInterpolate(5, 0, 0, 10, 100)).toBe(50);
    expect(linearInterpolate(0.5, 0, 0, 1, 10)).toBe(5);
  });

  test("interpolates at x0 exactly", () => {
    expect(linearInterpolate(0, 0, 10, 10, 20)).toBe(10);
  });

  test("interpolates at x1 exactly", () => {
    expect(linearInterpolate(10, 0, 10, 10, 20)).toBe(20);
  });

  test("interpolates quarter point", () => {
    expect(linearInterpolate(2.5, 0, 0, 10, 40)).toBe(10);
  });

  test("returns y0 when x0 equals x1 (degenerate interval)", () => {
    expect(linearInterpolate(5, 5, 10, 5, 20)).toBe(10);
    expect(linearInterpolate(5, 5, 42, 5, 99)).toBe(42);
  });

  test("extrapolates when x is outside [x0, x1]", () => {
    expect(linearInterpolate(15, 0, 0, 10, 100)).toBe(150);
    expect(linearInterpolate(-5, 0, 0, 10, 100)).toBe(-50);
  });

  test("handles negative values", () => {
    expect(linearInterpolate(0, -10, -20, 10, 0)).toBe(-10);
  });

  test("handles decimals with precision", () => {
    expect(linearInterpolate(1.5, 1, 2, 2, 4)).toBeCloseTo(3, 10);
  });

  test("returns y0 fallback when x0===x1 and y0 is not finite-safe fraction", () => {
    expect(linearInterpolate(3, 3, 7, 3, 9)).toBe(7);
  });
});

describe("resampleToPosGrid", () => {
  test("resamples to uniform grid of given length", () => {
    const frames = [
      { pos: 0, value: 0 },
      { pos: 0.5, value: 50 },
      { pos: 1, value: 100 },
    ];
    const result = resampleToPosGrid(frames, 11);
    expect(result).toHaveLength(11);
    expect(result[0]).toBe(0);
    expect(result[5]).toBeCloseTo(50, 6);
    expect(result[10]).toBeCloseTo(100, 6);
  });

  test("produces linearly spaced interpolation", () => {
    const frames = [
      { pos: 0, value: 0 },
      { pos: 1, value: 10 },
    ];
    const result = resampleToPosGrid(frames, 3);
    expect(result[0]).toBeCloseTo(0, 10);
    expect(result[1]).toBeCloseTo(5, 10);
    expect(result[2]).toBeCloseTo(10, 10);
  });

  test("single point grid returns the only value", () => {
    const frames = [
      { pos: 0, value: 42 },
      { pos: 1, value: 42 },
    ];
    const result = resampleToPosGrid(frames, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeCloseTo(42, 6);
  });

  test("returns array of zeros for empty frames", () => {
    const result = resampleToPosGrid([], 5);
    expect(result).toHaveLength(5);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  test("handles single frame by repeating its value", () => {
    const frames = [{ pos: 0.3, value: 7 }];
    const result = resampleToPosGrid(frames, 4);
    expect(result).toHaveLength(4);
    expect(result.every((v) => v === 7)).toBe(true);
  });

  test("sorts non-monotonic pos before resampling", () => {
    const frames = [
      { pos: 1, value: 100 },
      { pos: 0, value: 0 },
      { pos: 0.5, value: 50 },
    ];
    const result = resampleToPosGrid(frames, 11);
    expect(result[0]).toBeCloseTo(0, 6);
    expect(result[5]).toBeCloseTo(50, 6);
    expect(result[10]).toBeCloseTo(100, 6);
  });

  test("interpolates across gaps (linear is correct for gaps)", () => {
    const frames = [
      { pos: 0, value: 0 },
      { pos: 0.9, value: 90 },
      { pos: 1, value: 100 },
    ];
    const result = resampleToPosGrid(frames, 11);
    expect(result[5]).toBeCloseTo(50, 6);
  });

  test("clamps grid points at boundaries to known frame values", () => {
    const frames = [
      { pos: 0, value: 0 },
      { pos: 0.5, value: 50 },
      { pos: 1, value: 100 },
    ];
    const result = resampleToPosGrid(frames, 5);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(100);
  });

  test("handles values with decimals", () => {
    const frames = [
      { pos: 0, value: 1.5 },
      { pos: 1, value: 2.5 },
    ];
    const result = resampleToPosGrid(frames, 3);
    expect(result[1]).toBeCloseTo(2, 10);
  });
});

describe("interpolateTimeAtPos", () => {
  test("returns exact time when target pos matches a frame", () => {
    const frames = [
      { pos: 0, t: 0 },
      { pos: 0.5, t: 5000 },
      { pos: 1, t: 10000 },
    ];
    expect(interpolateTimeAtPos(frames, 0)).toBe(0);
    expect(interpolateTimeAtPos(frames, 0.5)).toBe(5000);
    expect(interpolateTimeAtPos(frames, 1)).toBe(10000);
  });

  test("linearly interpolates time within a bracket", () => {
    const frames = [
      { pos: 0, t: 0 },
      { pos: 0.5, t: 5000 },
      { pos: 1, t: 10000 },
    ];
    expect(interpolateTimeAtPos(frames, 0.25)).toBe(2500);
    expect(interpolateTimeAtPos(frames, 0.75)).toBe(7500);
  });

  test("returns 0 when target pos is before the first frame", () => {
    const frames = [
      { pos: 0.2, t: 2000 },
      { pos: 0.6, t: 6000 },
      { pos: 1, t: 10000 },
    ];
    expect(interpolateTimeAtPos(frames, 0)).toBe(0);
    expect(interpolateTimeAtPos(frames, 0.1)).toBe(0);
  });

  test("returns last time when target pos is after the last frame", () => {
    const frames = [
      { pos: 0, t: 0 },
      { pos: 0.4, t: 4000 },
      { pos: 0.8, t: 8000 },
    ];
    expect(interpolateTimeAtPos(frames, 0.9)).toBe(8000);
    expect(interpolateTimeAtPos(frames, 1)).toBe(8000);
  });

  test("returns 0 for empty frames", () => {
    expect(interpolateTimeAtPos([], 0.5)).toBe(0);
  });

  test("returns time of the only frame for single-element input", () => {
    expect(interpolateTimeAtPos([{ pos: 0.5, t: 7000 }], 0.5)).toBe(7000);
    expect(interpolateTimeAtPos([{ pos: 0.5, t: 7000 }], 0)).toBe(0);
    expect(interpolateTimeAtPos([{ pos: 0.5, t: 7000 }], 1)).toBe(7000);
  });

  test("handles two-frame bracket", () => {
    const frames = [
      { pos: 0, t: 0 },
      { pos: 1, t: 10000 },
    ];
    expect(interpolateTimeAtPos(frames, 0.3)).toBe(3000);
    expect(interpolateTimeAtPos(frames, 0.7)).toBe(7000);
  });

  test("handles non-sorted pos by binary searching on sorted copy", () => {
    const frames = [
      { pos: 1, t: 10000 },
      { pos: 0, t: 0 },
      { pos: 0.5, t: 5000 },
    ];
    expect(interpolateTimeAtPos(frames, 0.25)).toBeCloseTo(2500, 6);
    expect(interpolateTimeAtPos(frames, 0.75)).toBeCloseTo(7500, 6);
  });
});
