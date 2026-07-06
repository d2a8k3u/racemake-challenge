import { expect, test, describe } from "bun:test";
import { createApp } from "../src/server";

const app = createApp();

describe("GET /health", () => {
  test("returns 200 with { status: 'ok' }", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});