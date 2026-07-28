import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  install,
  preprocess,
  type PreprocessInput,
} from "../../../src/preprocess/index.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");
const minChunkSizeExponent = 10;
const maxChunkSizeExponent = 19;

async function main(): Promise<void> {
  const processStarted = performance.now();
  const chunkSizeExponent = parseChunkSizeExponent(process.argv.slice(2));
  const [input, expected] = await Promise.all([
    readInput(),
    readBinary("verifier-preprocess.bin"),
  ]);
  await install({ chunkSizeExponent });

  const operationStarted = performance.now();
  const actual = await preprocess(input);
  const operationMs = performance.now() - operationStarted;
  assertBytesEqual(actual, expected);

  console.log(JSON.stringify({
    mode: "node",
    chunkSizeExponent,
    chunkPoints: 2 ** chunkSizeExponent,
    parity: true,
    operationMs,
    processWallMs: performance.now() - processStarted,
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
  }));
}

async function readInput(): Promise<PreprocessInput> {
  const [permutation, instance, preprocessCrs] = await Promise.all([
    readBinary("permutation.bin"),
    readBinary("instance.bin"),
    readBinary("preprocess-crs.bin"),
  ]);
  return { permutation, instance, preprocessCrs };
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error("Chunk-size benchmark preprocess output mismatch.");
  }
}

function parseChunkSizeExponent(argv: readonly string[]): number {
  if (argv.length !== 2 || argv[0] !== "--chunk-size-exponent") {
    throw new Error("Usage: chunk-size --chunk-size-exponent <10..19>");
  }
  const exponent = Number(argv[1]);
  if (
    !Number.isInteger(exponent)
    || exponent < minChunkSizeExponent
    || exponent > maxChunkSizeExponent
  ) {
    throw new Error(
      `Chunk-size exponent must be an integer from ${minChunkSizeExponent} through ${maxChunkSizeExponent}.`,
    );
  }
  return exponent;
}

await main();
process.exit(0);
