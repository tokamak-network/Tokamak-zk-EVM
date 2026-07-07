import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  executeArtifactConverter,
  isArtifactConverterCommand,
  type ArtifactConverterCommand,
  type ArtifactConverterInput,
} from "../src/index.js";

function printUsage(): void {
  console.log(`Usage: convert-artifacts <command> [options]

Commands:
  json-to-verifier-binary    Convert native verifier JSON artifacts into runtime-ready verifier artifacts.
  json-rkyv-to-prover-binary Convert native JSON plus rkyv artifacts into runtime-ready prover artifacts.
  permutation-json-to-binary Convert native permutation.json into a prover permutation binary artifact.
  proof-binary-to-json       Convert a backend-wasm proof binary artifact file into native-compatible proof JSON.
  binary-to-debug-json       Convert a backend-wasm binary artifact file into debug JSON.

Options:
  --input <path>              Input file path.
  --output <path>             Output file path. Defaults to stdout for JSON output.
  --include-section-data      Include section payload hex in binary-to-debug-json output.

The CLI is only a Node.js file I/O wrapper around the web-compatible converter library exported from src/tools/artifact-converters/.`);
}

async function main(argv: readonly string[]): Promise<void> {
  const [commandValue, ...optionArgs] = argv;

  if (commandValue === undefined || commandValue === "--help" || commandValue === "-h") {
    printUsage();
    return;
  }

  if (!isArtifactConverterCommand(commandValue)) {
    throw new Error(`Unknown converter command: ${commandValue}.`);
  }

  const options = parseOptions(optionArgs);
  const input = await readConverterInput(commandValue, options);
  const output = await executeArtifactConverter({ command: commandValue, input });
  await writeConverterOutput(output, options);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Artifact conversion failed: ${message}`);
    process.exitCode = 1;
  });
}

interface CliOptions {
  readonly input?: string;
  readonly output?: string;
  readonly includeSectionData: boolean;
}

function parseOptions(args: readonly string[]): CliOptions {
  let input: string | undefined;
  let output: string | undefined;
  let includeSectionData = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--input") {
      input = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--output") {
      output = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--include-section-data") {
      includeSectionData = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}.`);
  }

  return { input, output, includeSectionData };
}

async function readConverterInput(
  command: ArtifactConverterCommand,
  options: CliOptions,
): Promise<ArtifactConverterInput> {
  switch (command) {
    case "json-to-verifier-binary":
      return readJsonInput(options);
    case "json-rkyv-to-prover-binary":
      return readJsonInput(options);
    case "permutation-json-to-binary":
      return readJsonInput(options);
    case "proof-binary-to-json":
      return { proofFile: await readBinaryInput(options, command) };
    case "binary-to-debug-json":
      return {
        artifactFile: await readBinaryInput(options, command),
        includeSectionData: options.includeSectionData,
      };
  }
}

async function readJsonInput(options: CliOptions): Promise<unknown> {
  if (options.input === undefined) {
    throw new Error("JSON converter commands require --input.");
  }

  return JSON.parse(await readFile(options.input, "utf8")) as unknown;
}

async function readBinaryInput(options: CliOptions, command: ArtifactConverterCommand): Promise<Uint8Array> {
  if (options.input === undefined) {
    throw new Error(`Converter command '${command}' requires --input.`);
  }

  return new Uint8Array(await readFile(options.input));
}

async function writeConverterOutput(output: unknown, options: CliOptions): Promise<void> {
  const bytes = output instanceof Uint8Array ? output : new TextEncoder().encode(`${JSON.stringify(output, null, 2)}\n`);

  if (options.output === undefined) {
    if (output instanceof Uint8Array) {
      throw new Error("Binary converter output requires --output.");
    }

    process.stdout.write(bytes);
    return;
  }

  await writeFile(options.output, bytes);
}

function readOptionValue(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Option ${option} requires a value.`);
  }

  return value;
}
