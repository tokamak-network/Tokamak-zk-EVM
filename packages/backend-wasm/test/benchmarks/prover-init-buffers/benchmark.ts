import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  parseProverPermutation,
  parseProverPlacementVariables,
} from "../../../src/prover/api/binary-input.js";
import {
  GENERATED_PROVER_SETUP_PARAMS,
  GENERATED_PROVER_SUBCIRCUIT_INFOS,
} from "../../../src/prover/generated/subcircuit-library.generated.js";
import {
  placementCount,
  placementSubcircuitId,
  placementVariableAt,
  placementVariableCount,
} from "../../../src/prover/protocol/witness.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import type { FieldRuntime } from "../../../src/runtime/field/field-types.js";
import { BivariatePolynomialBuffer } from "../../../src/runtime/polynomial/bivariate-polynomial-buffer.js";
import {
  buildPermutationEvalsDirect,
  buildPermutationEvalsWithArrays,
  buildSparseWitnessBaseline,
  buildSparseWitnessRawConditional,
  buildSparseWitnessUnconditional,
  findDegreeRaw,
  resizeWithRowCopies,
} from "./init-buffer-candidates.js";

const ITERATIONS = 3;

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    const [permutationFile, witnessFile] = await Promise.all([
      decodeBinaryArtifactFile(
        new Uint8Array(await readFile("fixtures/small/runtime/permutation.bin")),
      ),
      decodeBinaryArtifactFile(
        new Uint8Array(await readFile("fixtures/small/runtime/witness.bin")),
      ),
    ]);
    const permutation = parseProverPermutation(permutationFile);
    const placements = parseProverPlacementVariables(runtime, witnessFile);

    const permutationResult = benchmarkPermutation(runtime.Fr, permutation);
    const resizeResult = benchmarkResize(runtime.Fr);
    const degreeResult = benchmarkDegree(runtime.Fr);
    const sparseWitnessResult = benchmarkSparseWitness(runtime.Fr, placements);

    console.log(JSON.stringify({
      runtime: "node",
      iterations: ITERATIONS,
      permutation: permutationResult,
      resize: resizeResult,
      degree: degreeResult,
      sparseWitness: sparseWitnessResult,
    }, null, 2));
  } finally {
    await runtime.terminate();
  }
}

function benchmarkPermutation(
  field: FieldRuntime,
  permutation: ReturnType<typeof parseProverPermutation>,
) {
  const baseline = measureMedian(() =>
    buildPermutationEvalsWithArrays(field, GENERATED_PROVER_SETUP_PARAMS, permutation)
  );
  const candidate = measureMedian(() =>
    buildPermutationEvalsDirect(field, GENERATED_PROVER_SETUP_PARAMS, permutation)
  );
  assertBytesEqual(candidate.value.s0, baseline.value.s0, "permutation s0 evals");
  assertBytesEqual(candidate.value.s1, baseline.value.s1, "permutation s1 evals");
  return {
    entries: permutation.length,
    evalsPerPolynomial:
      (GENERATED_PROVER_SETUP_PARAMS.l_D - GENERATED_PROVER_SETUP_PARAMS.l)
      * GENERATED_PROVER_SETUP_PARAMS.s_max,
    baselineMs: baseline.medianMs,
    directMs: candidate.medianMs,
    parity: true,
  };
}

function benchmarkResize(
  field: FieldRuntime,
) {
  const input = createPatternPolynomial(field, 4096, 256);
  return [
    benchmarkResizeShape(input, 8192, 512, "grow"),
    benchmarkResizeShape(input, 2048, 128, "shrink"),
    benchmarkResizeShape(input, 4096, 256, "same-shape"),
  ];
}

function benchmarkResizeShape(
  input: BivariatePolynomialBuffer,
  targetXSize: number,
  targetYSize: number,
  label: string,
) {
  const baseline = measureMedian(() => input.resize(targetXSize, targetYSize));
  const candidate = measureMedian(() =>
    resizeWithRowCopies(input, targetXSize, targetYSize)
  );
  assertBytesEqual(
    candidate.value.coefficients,
    baseline.value.coefficients,
    `${label} resize`,
  );
  return {
    label,
    sourceShape: `${input.xSize}x${input.ySize}`,
    targetShape: `${candidate.value.xSize}x${candidate.value.ySize}`,
    baselineMs: baseline.medianMs,
    rowCopyMs: candidate.medianMs,
    parity: true,
  };
}

function benchmarkDegree(
  field: FieldRuntime,
) {
  const dense = createPatternPolynomial(field, 4096, 256);
  const allZero = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    field.createZeroBuffer(4096 * 256),
    4096,
    256,
  );
  const trailingZeroBytes = dense.coefficients.slice();
  trailingZeroBytes.fill(0, 2048 * 256 * field.byteLength);
  const trailingZero = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    trailingZeroBytes,
    4096,
    256,
  );

  return [
    benchmarkDegreeCase(dense, "dense"),
    benchmarkDegreeCase(trailingZero, "trailing-zero"),
    benchmarkDegreeCase(allZero, "all-zero"),
  ];
}

function benchmarkDegreeCase(
  input: BivariatePolynomialBuffer,
  label: string,
) {
  const baseline = measureMedian(() => input.findDegree());
  const candidate = measureMedian(() => findDegreeRaw(input));
  if (
    baseline.value.xDegree !== candidate.value.xDegree
    || baseline.value.yDegree !== candidate.value.yDegree
  ) {
    throw new Error(`${label} degree mismatch.`);
  }
  return {
    label,
    baselineMs: baseline.medianMs,
    rawMs: candidate.medianMs,
    degree: candidate.value,
  };
}

function benchmarkSparseWitness(
  field: FieldRuntime,
  placements: ReturnType<typeof parseProverPlacementVariables>,
) {
  const assignments = collectMidAssignments(field, placements);
  const densities = [
    { label: "zero", density: 0 },
    { label: "ten-percent", density: 0.1 },
    { label: "half", density: 0.5 },
    { label: "dense", density: 1 },
    { label: "actual", density: undefined },
  ] as const;

  return densities.map(({ label, density }) => {
    const values = density === undefined
      ? assignments.values
      : createDensityValues(field, assignments.outputIndices.length, density);
    const args = [
      field,
      assignments.outputElementCount,
      assignments.outputIndices,
      values,
    ] as const;
    const baseline = measureMedian(() => buildSparseWitnessBaseline(...args));
    const raw = measureMedian(() => buildSparseWitnessRawConditional(...args));
    const unconditional = measureMedian(() => buildSparseWitnessUnconditional(...args));
    assertBytesEqual(raw.value, baseline.value, `${label} raw sparse witness`);
    assertBytesEqual(
      unconditional.value,
      baseline.value,
      `${label} unconditional sparse witness`,
    );
    return {
      label,
      assignmentCount: assignments.outputIndices.length,
      baselineMs: baseline.medianMs,
      rawConditionalMs: raw.medianMs,
      unconditionalMs: unconditional.medianMs,
      parity: true,
    };
  });
}

function collectMidAssignments(
  field: FieldRuntime,
  placements: ReturnType<typeof parseProverPlacementVariables>,
) {
  const setup = GENERATED_PROVER_SETUP_PARAMS;
  const indices: number[] = [];
  const values: Uint8Array[] = [];
  for (let placementIndex = 0; placementIndex < placementCount(placements); placementIndex += 1) {
    const info = GENERATED_PROVER_SUBCIRCUIT_INFOS[
      placementSubcircuitId(placements, placementIndex)
    ];
    for (
      let localIndex = 0;
      localIndex < placementVariableCount(placements, placementIndex);
      localIndex += 1
    ) {
      const globalIndex = info.flattenMap[localIndex];
      if (globalIndex >= setup.l && globalIndex < setup.l_D) {
        indices.push((globalIndex - setup.l) * setup.s_max + placementIndex);
        values.push(placementVariableAt(placements, placementIndex, localIndex));
      }
    }
  }
  return {
    outputElementCount: (setup.l_D - setup.l) * setup.s_max,
    outputIndices: Uint32Array.from(indices),
    values: field.concat(values),
  };
}

function createDensityValues(
  field: FieldRuntime,
  count: number,
  density: number,
): Uint8Array {
  const output = field.createZeroBuffer(count);
  const nonzeroCount = Math.floor(count * density);
  for (let index = 0; index < nonzeroCount; index += 1) {
    output.set(field.one, index * field.byteLength);
  }
  return output;
}

function createPatternPolynomial(
  field: FieldRuntime,
  xSize: number,
  ySize: number,
): BivariatePolynomialBuffer {
  const coefficients = field.createZeroBuffer(xSize * ySize);
  const values = [
    field.one,
    field.fromBigInt(2n),
    field.fromBigInt(3n),
    field.fromBigInt(5n),
  ];
  for (let index = 0; index < xSize * ySize; index += 1) {
    coefficients.set(values[index % values.length], index * field.byteLength);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    coefficients,
    xSize,
    ySize,
  );
}

function measureMedian<T>(run: () => T): { readonly value: T; readonly medianMs: number } {
  const samples: number[] = [];
  let value = run();
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const startedAt = performance.now();
    value = run();
    samples.push(performance.now() - startedAt);
  }
  samples.sort((left, right) => left - right);
  return {
    value,
    medianMs: samples[Math.floor(samples.length / 2)],
  };
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (
    actual.byteLength !== expected.byteLength
    || Buffer.compare(
      Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength),
      Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength),
    ) !== 0
  ) {
    throw new Error(`${label} mismatch.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
