import { Hono } from "hono";
import { logger } from "hono/logger";
import { health } from "./routes/health";
import { analysis } from "./routes/analysis";
import { errorHandler } from "./middleware/error-handler";

export function createApp(): Hono {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/health", health);
  app.route("/analysis", analysis);
  return app;
}

if (import.meta.main) {
  const app = createApp();
  app.use("*", logger());
  Bun.serve({ port: 3000, fetch: app.fetch });
  console.log("Racemake telemetry service running on http://localhost:3000");
}