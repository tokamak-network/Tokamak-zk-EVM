import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import { loadPreprocessInputFromBinaryInput } from "../../../src/preprocess/api/binary-input.js";
import { commitDensePreprocessPolynomial } from "../../../src/preprocess/commitments/preprocess-commitments.js";
import type {
  ProverCrsG1Section,
  ProverCrsRuntime,
} from "../../../src/prover/api/binary-input.js";
import { encodePolynomialBufferWithSigma1 } from "../../../src/prover/commitments/sigma1-encoder.js";
import type { ProverSetupParams } from "../../../src/prover/protocol/witness.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { buildPermutationPolynomials } from "../../../src/runtime/polynomial/permutation-polynomials.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");
const chunkPoints = 1 << 18;
const g1AffineBytes = 96;

type Mode = "adaptive" | "known-dense";

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const [permutation, instance, preprocessCrs, verifierPreprocess] = await Promise.all([
    readBinary("permutation.bin"),
    readBinary("instance.bin"),
    readBinary("preprocess-crs.bin"),
    readBinary("verifier-preprocess.bin"),
  ]);
  const runtime = await createCurveRuntime();
  try {
    const input = await loadPreprocessInputFromBinaryInput(runtime, {
      permutation,
      instance,
      preprocessCrs,
    });
    const [polynomial] = await buildPermutationPolynomials(
      runtime.Fr,
      input.setup.l_D - input.setup.l,
      input.setup.s_max,
      input.permutation,
    );
    const density = coefficientDensity(polynomial.coefficients, runtime.Fr.byteLength);
    const compactSetup = createCompactEncoderSetup(input.setup);
    const compactCrs = createCompactEncoderCrs(runtime.G1.zero, input.crs.xyPowers);
    const expected = await readExpectedS0(verifierPreprocess);
    const executeAdaptive = () => encodePolynomialBufferWithSigma1(
        runtime,
        compactCrs,
        compactSetup,
        polynomial,
        chunkPoints,
      );
    const executeKnownDense = () => commitDensePreprocessPolynomial(
        runtime,
        input.crs.xyPowers,
        polynomial,
        chunkPoints,
      );

    const measured = await measureCommitment(
      mode === "adaptive" ? executeAdaptive : executeKnownDense,
    );
    assertPointParity(runtime.G1.toAffine(measured.point), expected);

    console.log(JSON.stringify({
      mode,
      parity: true,
      coefficientDensity: density,
      timingMs: measured.elapsedMs,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }));
  } finally {
    await runtime.terminate();
  }
}

async function measureCommitment(
  execute: () => Promise<Uint8Array>,
): Promise<{ readonly point: Uint8Array; readonly elapsedMs: number }> {
  const started = performance.now();
  const point = await execute();
  return {
    point,
    elapsedMs: performance.now() - started,
  };
}

function createCompactEncoderSetup(setup: ProverSetupParams): ProverSetupParams {
  if (setup.s_max % 2 !== 0) {
    throw new Error("Compact Sigma1 benchmark requires an even setup s_max.");
  }
  return {
    ...setup,
    s_max: setup.s_max / 2,
  };
}

function createCompactEncoderCrs(
  zeroG1: Uint8Array,
  xyPowers: Uint8Array,
): ProverCrsRuntime {
  const emptySection: ProverCrsG1Section = {
    data: new Uint8Array(),
    count: 0,
    elementByteLength: 96,
  };
  return {
    G: zeroG1,
    H: new Uint8Array(192),
    lagrangeKL: zeroG1,
    sigma1: {
      x: zeroG1,
      y: zeroG1,
      delta: zeroG1,
      eta: zeroG1,
      xyPowers: {
        data: xyPowers,
        count: xyPowers.byteLength / 96,
        elementByteLength: 96,
      },
      gammaInvOInst: emptySection,
      etaInvLiOInterAlpha4Kj: emptySection,
      deltaInvLiOPrv: emptySection,
      deltaInvAlphakXhTx: emptySection,
      deltaInvAlpha4XjTx: emptySection,
      deltaInvAlphakYiTy: emptySection,
    },
    sigma2: {
      alpha: new Uint8Array(192),
      alpha2: new Uint8Array(192),
      alpha3: new Uint8Array(192),
      alpha4: new Uint8Array(192),
      gamma: new Uint8Array(192),
      delta: new Uint8Array(192),
      eta: new Uint8Array(192),
      x: new Uint8Array(192),
      y: new Uint8Array(192),
    },
  };
}

function coefficientDensity(buffer: Uint8Array, elementBytes: number): number {
  if (buffer.byteOffset % 4 !== 0 || elementBytes !== 32) {
    throw new Error("Sigma1 benchmark expects aligned 32-byte field elements.");
  }
  const words = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  const elementCount = buffer.byteLength / elementBytes;
  let nonzero = 0;
  for (let index = 0; index < elementCount; index += 1) {
    const offset = index * 8;
    if (
      (
        words[offset] | words[offset + 1] | words[offset + 2] | words[offset + 3]
        | words[offset + 4] | words[offset + 5] | words[offset + 6] | words[offset + 7]
      ) !== 0
    ) {
      nonzero += 1;
    }
  }
  return nonzero / elementCount;
}

function assertPointParity(actual: Uint8Array, expected: Uint8Array): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error("Sigma1 encoding benchmark commitment mismatch.");
  }
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

async function readExpectedS0(fileBytes: Uint8Array): Promise<Uint8Array> {
  const file = await decodeBinaryArtifactFile(fileBytes);
  const points = file.sections[0]?.data;
  if (points === undefined || points.byteLength < g1AffineBytes) {
    throw new Error("Native preprocess fixture does not contain s0.");
  }
  return points.subarray(0, g1AffineBytes);
}

function parseMode(argv: readonly string[]): Mode {
  if (argv.length !== 2 || argv[0] !== "--mode") {
    throw new Error("Usage: sigma1-encoding --mode <adaptive|known-dense>");
  }
  const mode = argv[1];
  if (mode === "adaptive" || mode === "known-dense") {
    return mode;
  }
  throw new Error(`Unsupported Sigma1 encoding benchmark mode: ${mode}`);
}

await main();
