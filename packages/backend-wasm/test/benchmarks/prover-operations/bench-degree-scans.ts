import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type FieldRuntime,
} from "../../../src/index.js";

interface Degree {
  readonly xDegree: number;
  readonly yDegree: number;
}

interface Sample {
  readonly label: string;
  readonly polynomial: BivariatePolynomialBuffer;
  readonly expected: Degree;
}

interface Stats {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
}

const X_SIZE = 4096;
const Y_SIZE = 256;
const WARMUPS = 1;
const ITERATIONS = 5;

async function main(): Promise<void> {
  const runtime = await createCurveRuntime({ singleThread: true });
  try {
    const samples = buildSamples(runtime.Fr);
    console.log("Degree scan benchmark");
    console.log(`shape: ${X_SIZE}x${Y_SIZE}`);
    console.log(`warmups: ${WARMUPS}, measured iterations: ${ITERATIONS}`);
    console.log("| case | scalar isZero | raw words | speedup |");
    console.log("| --- | ---: | ---: | ---: |");

    for (const sample of samples) {
      assertDegree(sample.label, sample.expected, sample.polynomial.findDegree());
      assertDegree(sample.label, sample.expected, findDegreeRaw(sample.polynomial));
      const scalar = measure(
        () => sample.polynomial.findDegree(),
        sample.expected,
        `${sample.label} scalar`,
      );
      const raw = measure(
        () => findDegreeRaw(sample.polynomial),
        sample.expected,
        `${sample.label} raw`,
      );
      console.log(
        `| ${sample.label} | ${formatStats(scalar)} | ${formatStats(raw)} `
          + `| ${(scalar.medianMs / raw.medianMs).toFixed(2)}x |`,
      );
    }
  } finally {
    await runtime.terminate();
  }
}

function buildSamples(field: FieldRuntime): Sample[] {
  return [
    {
      label: "dense",
      polynomial: createSample(field, "dense"),
      expected: { xDegree: X_SIZE - 1, yDegree: Y_SIZE - 1 },
    },
    {
      label: "trailing-zero",
      polynomial: createSample(field, "trailing-zero"),
      expected: { xDegree: X_SIZE / 2 - 1, yDegree: Y_SIZE / 2 - 1 },
    },
    {
      label: "sparse",
      polynomial: createSample(field, "sparse"),
      expected: { xDegree: 0, yDegree: 0 },
    },
    {
      label: "all-zero",
      polynomial: createSample(field, "all-zero"),
      expected: { xDegree: -1, yDegree: -1 },
    },
  ];
}

function createSample(
  field: FieldRuntime,
  kind: "dense" | "trailing-zero" | "sparse" | "all-zero",
): BivariatePolynomialBuffer {
  const coefficients = field.createZeroBuffer(X_SIZE * Y_SIZE);
  if (kind === "dense") {
    for (let index = 0; index < X_SIZE * Y_SIZE; index += 1) {
      field.writeBufferElement(coefficients, index, field.one);
    }
  } else if (kind === "trailing-zero") {
    field.writeBufferElement(
      coefficients,
      (X_SIZE / 2 - 1) * Y_SIZE + (Y_SIZE / 2 - 1),
      field.one,
    );
  } else if (kind === "sparse") {
    field.writeBufferElement(coefficients, 0, field.one);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, coefficients, X_SIZE, Y_SIZE);
}

function measure(operation: () => Degree, expected: Degree, label: string): Stats {
  for (let index = 0; index < WARMUPS; index += 1) {
    assertDegree(label, expected, operation());
  }
  const samples: number[] = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const start = performance.now();
    const degree = operation();
    samples.push(performance.now() - start);
    assertDegree(label, expected, degree);
  }
  samples.sort((left, right) => left - right);
  return {
    medianMs: samples[Math.floor(samples.length / 2)],
    minMs: samples[0],
    maxMs: samples[samples.length - 1],
  };
}

function findDegreeRaw(polynomial: BivariatePolynomialBuffer): Degree {
  const words = uint32Words(polynomial.coefficients);
  let xDegree = -1;
  let yDegree = -1;
  for (let x = polynomial.xSize - 1; x >= 0 && xDegree < 0; x -= 1) {
    for (let y = 0; y < polynomial.ySize; y += 1) {
      if (!isZeroWordElement(words, x * polynomial.ySize + y)) {
        xDegree = x;
        break;
      }
    }
  }
  for (let y = polynomial.ySize - 1; y >= 0 && yDegree < 0; y -= 1) {
    for (let x = 0; x < polynomial.xSize; x += 1) {
      if (!isZeroWordElement(words, x * polynomial.ySize + y)) {
        yDegree = y;
        break;
      }
    }
  }
  return { xDegree, yDegree };
}

function uint32Words(buffer: Uint8Array): Uint32Array {
  if (buffer.byteOffset % 4 !== 0 || buffer.byteLength % 4 !== 0) {
    throw new Error("Raw degree scan requires a four-byte-aligned field buffer.");
  }
  return new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

function isZeroWordElement(words: Uint32Array, elementIndex: number): boolean {
  const offset = elementIndex * 8;
  return (
    words[offset] | words[offset + 1] | words[offset + 2] | words[offset + 3]
    | words[offset + 4] | words[offset + 5] | words[offset + 6] | words[offset + 7]
  ) === 0;
}

function assertDegree(label: string, expected: Degree, actual: Degree): void {
  if (expected.xDegree !== actual.xDegree || expected.yDegree !== actual.yDegree) {
    throw new Error(
      `${label} degree mismatch: expected (${expected.xDegree}, ${expected.yDegree}), `
        + `got (${actual.xDegree}, ${actual.yDegree}).`,
    );
  }
}

function formatStats(stats: Stats): string {
  return `${stats.medianMs.toFixed(3)} ms (${stats.minMs.toFixed(3)}-${stats.maxMs.toFixed(3)})`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
