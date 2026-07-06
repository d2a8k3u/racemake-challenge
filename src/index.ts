import { logger } from "hono/logger";
import { createApp } from "./server";

function isServerMode(): boolean {
  return process.argv.slice(2).length === 0;
}

function startServer(): void {
  const app = createApp();
  app.use("*", logger());
  Bun.serve({ port: 3000, fetch: app.fetch });
  console.log("Racemake telemetry service running on http://localhost:3000");
}

async function main(): Promise<void> {
  if (isServerMode()) {
    startServer();
    return;
  }

  const { runCli } = await import("./cli");
  const exitCode = await runCli(process.argv);
  process.exit(exitCode);
}

await main();
