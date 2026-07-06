import type { Context } from "hono";

export function errorHandler(err: Error, c: Context): Response {
  return c.json({ error: err.message }, 500);
}