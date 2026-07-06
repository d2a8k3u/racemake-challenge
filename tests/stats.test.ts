import { describe, expect, test } from "bun:test";
import { mad, mean, median, movingAverage, quantile, stdev } from "../src/utils/stats";

describe("mean", () => {
  test("returns mean of numbers", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([10, 20, 30])).toBe(20);
  });

  test("returns 0 for empty array", () => {
    expect(mean([])).toBe(0);
  });

  test("returns the value for single-element array", () => {
    expect(mean([42])).toBe(42);
  });

  test("handles negative numbers", () => {
    expect(mean([-2, 2])).toBe(0);
    expect(mean([-3, -1, -5])).toBe(-3);
  });

  test("handles decimals", () => {
    expect(mean([1.5, 2.5])).toBe(2);
    expect(mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 10);
  });

  test("ignores NaN and Infinity entries (treats as guardNaN'd)", () => {
    expect(mean([1, NaN, 3])).toBeCloseTo(2, 10);
    expect(mean([1, Infinity, 3])).toBeCloseTo(2, 10);
  });

  test("returns 0 when all entries are non-finite", () => {
    expect(mean([NaN, Infinity])).toBe(0);
  });
});

describe("median", () => {
  test("returns middle of odd-length array", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([5, 1, 3, 2, 4])).toBe(3);
  });

  test("returns average of two middle for even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 3, 2, 4])).toBe(2.5);
  });

  test("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  test("returns the value for single-element array", () => {
    expect(median([42])).toBe(42);
  });

  test("handles negatives", () => {
    expect(median([-3, -1, -2])).toBe(-2);
    expect(median([-4, -1])).toBe(-2.5);
  });

  test("ignores non-finite entries", () => {
    expect(median([1, NaN, 3])).toBe(2);
    expect(median([1, 2, Infinity, 4])).toBe(2);
  });

  test("returns 0 when all non-finite", () => {
    expect(median([NaN, Infinity])).toBe(0);
  });
});

describe("stdev", () => {
  test("returns sample standard deviation", () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });

  test("returns 0 for empty array", () => {
    expect(stdev([])).toBe(0);
  });

  test("returns 0 for single-element array (sample stdev undefined)", () => {
    expect(stdev([42])).toBe(0);
  });

  test("returns 0 when all values are equal", () => {
    expect(stdev([5, 5, 5, 5])).toBe(0);
  });

  test("handles negative numbers", () => {
    expect(stdev([-2, 2])).toBeCloseTo(Math.sqrt(8), 6);
  });

  test("ignores non-finite entries", () => {
    expect(stdev([1, NaN, 3])).toBeCloseTo(Math.sqrt(2), 6);
  });

  test("returns 0 when fewer than 2 finite entries", () => {
    expect(stdev([NaN, NaN])).toBe(0);
    expect(stdev([42, NaN])).toBe(0);
  });
});

describe("movingAverage", () => {
  test("returns centered moving average for odd window", () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([1.5, 2, 3, 4, 4.5]);
  });

  test("returns centered moving average for even window", () => {
    const result = movingAverage([1, 2, 3, 4], 2);
    expect(result[0]).toBe(1.5);
    expect(result[1]).toBe(2.5);
    expect(result[2]).toBe(3.5);
    expect(result[3]).toBe(4);
  });

  test("handles window larger than array (window engulfs all data)", () => {
    const result = movingAverage([1, 2, 3], 10);
    expect(result).toEqual([2, 2, 2]);
  });

  test("returns same array for window 1", () => {
    expect(movingAverage([1, 2, 3, 4], 1)).toEqual([1, 2, 3, 4]);
  });

  test("returns empty for empty input", () => {
    expect(movingAverage([], 3)).toEqual([]);
  });

  test("handles single element", () => {
    expect(movingAverage([5], 3)).toEqual([5]);
  });

  test("edges use smaller window (left edge)", () => {
    const result = movingAverage([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBe(1.5);
    expect(result[4]).toBe(4.5);
  });

  test("ignores non-finite in the window", () => {
    const result = movingAverage([1, NaN, 3], 3);
    expect(result[1]).toBe(2);
  });

  test("returns guardNaN(0) when no finite entries in window", () => {
    const result = movingAverage([NaN, NaN, NaN], 3);
    expect(result[1]).toBe(0);
  });
});

describe("quantile", () => {
  test("returns median for q=0.5", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  test("returns min for q=0", () => {
    expect(quantile([3, 1, 2, 5, 4], 0)).toBe(1);
  });

  test("returns max for q=1", () => {
    expect(quantile([3, 1, 2, 5, 4], 1)).toBe(5);
  });

  test("returns 0 for empty array", () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  test("returns value for single-element array", () => {
    expect(quantile([42], 0.25)).toBe(42);
    expect(quantile([42], 0.75)).toBe(42);
  });

  test("interpolates between values", () => {
    const q25 = quantile([1, 2, 3, 4], 0.25);
    expect(q25).toBeGreaterThanOrEqual(1);
    expect(q25).toBeLessThanOrEqual(4);
  });

  test("clamps q to [0, 1]", () => {
    expect(quantile([1, 2, 3], -0.5)).toBe(1);
    expect(quantile([1, 2, 3], 1.5)).toBe(3);
  });

  test("ignores non-finite entries", () => {
    expect(quantile([1, NaN, 2, 3], 0.5)).toBe(2);
  });

  test("returns 0 when all non-finite", () => {
    expect(quantile([NaN, Infinity], 0.5)).toBe(0);
  });

  test("handles unsorted input", () => {
    expect(quantile([5, 3, 1, 4, 2], 0.5)).toBe(3);
    expect(quantile([5, 3, 1, 4, 2], 0)).toBe(1);
    expect(quantile([5, 3, 1, 4, 2], 1)).toBe(5);
  });
});

describe("mad", () => {
  test("returns median absolute deviation", () => {
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });

  test("returns 0 for empty array", () => {
    expect(mad([])).toBe(0);
  });

  test("returns 0 for single-element array", () => {
    expect(mad([42])).toBe(0);
  });

  test("returns 0 when all values are equal", () => {
    expect(mad([5, 5, 5, 5])).toBe(0);
  });

  test("handles negative numbers", () => {
    expect(mad([-2, 0, 2])).toBe(2);
  });

  test("ignores non-finite entries", () => {
    expect(mad([1, NaN, 2, 3])).toBe(1);
  });

  test("returns 0 when all non-finite", () => {
    expect(mad([NaN, Infinity])).toBe(0);
  });

  test("handles symmetric data", () => {
    expect(mad([10, 10, 10, 20, 20, 20])).toBe(5);
  });
});
