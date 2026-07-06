import { describe, expect, test } from "bun:test";
import { clamp, guardNaN, isFiniteNumber, safeDiv, safeSqrt } from "../src/utils/math";

describe("clamp", () => {
  test("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, -10, 10)).toBe(-3);
  });

  test("clamps to min when below range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(-100, -10, 10)).toBe(-10);
  });

  test("clamps to max when above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(100, -10, 10)).toBe(10);
  });

  test("handles equal min and max", () => {
    expect(clamp(5, 7, 7)).toBe(7);
    expect(clamp(7, 7, 7)).toBe(7);
  });

  test("returns min when value is NaN", () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
  });

  test("handles Infinity value", () => {
    expect(clamp(Infinity, 0, 10)).toBe(10);
    expect(clamp(-Infinity, 0, 10)).toBe(0);
  });

  test("handles decimal values", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(1.7, 0, 1)).toBe(1);
  });
});

describe("safeDiv", () => {
  test("performs normal division", () => {
    expect(safeDiv(10, 2)).toBe(5);
    expect(safeDiv(7, 2)).toBe(3.5);
    expect(safeDiv(-10, 2)).toBe(-5);
  });

  test("returns fallback when denominator is zero", () => {
    expect(safeDiv(10, 0)).toBe(0);
    expect(safeDiv(10, 0, 42)).toBe(42);
    expect(safeDiv(-10, 0, -1)).toBe(-1);
  });

  test("returns fallback when denominator is NaN", () => {
    expect(safeDiv(10, NaN)).toBe(0);
    expect(safeDiv(10, NaN, 99)).toBe(99);
  });

  test("returns fallback when denominator is Infinity", () => {
    expect(safeDiv(10, Infinity)).toBe(0);
    expect(safeDiv(10, Infinity, 7)).toBe(7);
  });

  test("returns fallback when numerator is NaN", () => {
    expect(safeDiv(NaN, 2)).toBe(0);
    expect(safeDiv(NaN, 2, 5)).toBe(5);
  });

  test("returns fallback when both are NaN", () => {
    expect(safeDiv(NaN, NaN)).toBe(0);
    expect(safeDiv(NaN, NaN, 8)).toBe(8);
  });

  test("handles Infinity numerator with finite denominator", () => {
    expect(safeDiv(Infinity, 2)).toBe(0);
    expect(safeDiv(Infinity, 2, 3)).toBe(3);
  });

  test("default fallback is zero", () => {
    expect(safeDiv(1, 0)).toBe(0);
  });
});

describe("guardNaN", () => {
  test("returns value when finite", () => {
    expect(guardNaN(5)).toBe(5);
    expect(guardNaN(-3.14)).toBe(-3.14);
    expect(guardNaN(0)).toBe(0);
  });

  test("returns fallback when value is NaN", () => {
    expect(guardNaN(NaN)).toBe(0);
    expect(guardNaN(NaN, 42)).toBe(42);
  });

  test("returns fallback when value is Infinity", () => {
    expect(guardNaN(Infinity)).toBe(0);
    expect(guardNaN(-Infinity)).toBe(0);
    expect(guardNaN(Infinity, 7)).toBe(7);
  });

  test("default fallback is zero", () => {
    expect(guardNaN(NaN)).toBe(0);
  });
});

describe("safeSqrt", () => {
  test("returns square root of positive numbers", () => {
    expect(safeSqrt(4)).toBe(2);
    expect(safeSqrt(9)).toBe(3);
    expect(safeSqrt(16)).toBe(4);
  });

  test("returns 0 for zero", () => {
    expect(safeSqrt(0)).toBe(0);
  });

  test("returns 0 for negative inputs", () => {
    expect(safeSqrt(-1)).toBe(0);
    expect(safeSqrt(-100)).toBe(0);
  });

  test("handles decimals", () => {
    expect(safeSqrt(0.25)).toBe(0.5);
    expect(safeSqrt(2.25)).toBe(1.5);
  });

  test("returns 0 for NaN input", () => {
    expect(safeSqrt(NaN)).toBe(0);
  });

  test("returns 0 for Infinity input", () => {
    expect(safeSqrt(Infinity)).toBe(0);
  });
});

describe("isFiniteNumber", () => {
  test("returns true for finite numbers", () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(42)).toBe(true);
    expect(isFiniteNumber(-3.14)).toBe(true);
    expect(isFiniteNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  test("returns false for NaN", () => {
    expect(isFiniteNumber(NaN)).toBe(false);
  });

  test("returns false for Infinity", () => {
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber(-Infinity)).toBe(false);
  });

  test("returns false for non-number types", () => {
    expect(isFiniteNumber("5" as unknown as number)).toBe(false);
    expect(isFiniteNumber(null as unknown as number)).toBe(false);
    expect(isFiniteNumber(undefined as unknown as number)).toBe(false);
    expect(isFiniteNumber({} as unknown as number)).toBe(false);
    expect(isFiniteNumber([] as unknown as number)).toBe(false);
  });
});
