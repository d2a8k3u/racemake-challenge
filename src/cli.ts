import { z } from "zod";
import { ParsedStintSchema } from "./ingestion/schema";
import { runAnalysisPipeline } from "./routes/analysis";

interface CliOptions {
  inputPath: string;
  outputPath: string | null;
}

function parseArgs(argv: string[]): CliOptions | null {
  const positional: string[] = [];
  let outputPath: string | null = null;

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--out=")) {
      outputPath = arg.slice(6);
      continue;
    }
    positional.push(arg);
  }

  if (positional.length === 0) {
    return null;
  }

  return { inputPath: positional[0], outputPath };
}

async function readTelemetry(path: string): Promise<z.infer<typeof ParsedStintSchema>> {
  let rawText: string;
  try {
    rawText = await Bun.file(path).text();
  } catch {
    throw new Error(`Cannot read file: ${path}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new Error(`File is not valid JSON: ${path}`);
  }

  const result = ParsedStintSchema.safeParse(parsedJson);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Telemetry data failed schema validation: ${issues}`);
  }

  return result.data;
}

async function writeOutput(result: unknown, outputPath: string | null): Promise<void> {
  const json = JSON.stringify(result, null, 2);
  if (outputPath) {
    await Bun.write(outputPath, json);
    return;
  }
  process.stdout.write(json);
}

export async function runCli(argv: string[]): Promise<number> {
  const options = parseArgs(argv);

  if (!options) {
    process.stderr.write("Usage: bun run src/index.ts <telemetry.json> [--out=<result.json>]\n");
    return 1;
  }

  try {
    const telemetry = await readTelemetry(options.inputPath);
    const analysisResult = runAnalysisPipeline(telemetry);
    await writeOutput(analysisResult, options.outputPath);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}