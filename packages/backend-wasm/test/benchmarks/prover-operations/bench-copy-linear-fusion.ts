import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";
import {
  mulByLinearX,
  mulByLinearY,
  mulByXMinusOne,
  multiplyByLagrangeK0,
} from "../../../src/prover/internal/polynomial-ops.js";

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

interface Options {
  readonly shape: Shape;
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

interface Record {
  readonly candidate: string;
  readonly shape: string;
  readonly ms: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: true });
  try {
    const field = runtime.Fr;
    const rD = patternedPolynomial(field, options.shape, 0x31n);
    const gD = patternedPolynomial(field, options.shape, 0x53n);
    const linearCoefficients = [field.fromBigInt(3n), field.fromBigInt(5n)];
    const scale = field.fromBigInt(7n);

    for (const parityScale of [field.zero, field.one, scale]) {
      assertBytesEqual(
        (await currentInnerX(rD, gD, linearCoefficients, parityScale)).coefficients,
        fusedLinearPlusScaled(rD, gD, linearCoefficients, parityScale, "x").coefficients,
        "fused X-linear inner parity",
      );
      assertBytesEqual(
        (await currentInnerY(rD, gD, linearCoefficients, parityScale)).coefficients,
        fusedLinearPlusScaled(rD, gD, linearCoefficients, parityScale, "y").coefficients,
        "fused Y-linear inner parity",
      );
    }

    const currentX = await currentInnerX(rD, gD, linearCoefficients, scale);
    const fusedX = fusedLinearPlusScaled(rD, gD, linearCoefficients, scale, "x");
    const currentY = await currentInnerY(rD, gD, linearCoefficients, scale);
    const fusedY = fusedLinearPlusScaled(rD, gD, linearCoefficients, scale, "y");
    assertBytesEqual(currentX.coefficients, fusedX.coefficients, "representative X inner parity");
    assertBytesEqual(currentY.coefficients, fusedY.coefficients, "representative Y inner parity");
    assertBytesEqual(
      (await mulByXMinusOne(currentX)).coefficients,
      (await mulByXMinusOne(fusedX)).coefficients,
      "representative X term2 parity",
    );
    assertBytesEqual(
      (await mulByXMinusOne(currentY)).coefficients,
      (await mulByXMinusOne(fusedY)).coefficients,
      "representative Y term2 parity",
    );
    assertBytesEqual(
      (await multiplyByLagrangeK0(currentX, options.shape.xSize)).coefficients,
      (await multiplyByLagrangeK0(fusedX, options.shape.xSize)).coefficients,
      "representative X term3 parity",
    );
    assertBytesEqual(
      (await multiplyByLagrangeK0(currentY, options.shape.xSize)).coefficients,
      (await multiplyByLagrangeK0(fusedY, options.shape.xSize)).coefficients,
      "representative Y term3 parity",
    );

    const records: Record[] = [
      await record(options, "current-inner-x", () => currentInnerX(rD, gD, linearCoefficients, scale)),
      await record(options, "fused-inner-x", () => fusedLinearPlusScaled(rD, gD, linearCoefficients, scale, "x")),
      await record(options, "current-inner-y", () => currentInnerY(rD, gD, linearCoefficients, scale)),
      await record(options, "fused-inner-y", () => fusedLinearPlusScaled(rD, gD, linearCoefficients, scale, "y")),
      await record(options, "current-term2-x", async () =>
        mulByXMinusOne(await currentInnerX(rD, gD, linearCoefficients, scale))),
      await record(options, "fused-term2-x", () =>
        mulByXMinusOne(fusedLinearPlusScaled(rD, gD, linearCoefficients, scale, "x"))),
      await record(options, "current-term2-y", async () =>
        mulByXMinusOne(await currentInnerY(rD, gD, linearCoefficients, scale))),
      await record(options, "fused-term2-y", () =>
        mulByXMinusOne(fusedLinearPlusScaled(rD, gD, linearCoefficients, scale, "y"))),
      await record(options, "current-term3-x", async () =>
        multiplyByLagrangeK0(
          await currentInnerX(rD, gD, linearCoefficients, scale),
          options.shape.xSize,
        )),
      await record(options, "fused-term3-x", () =>
        multiplyByLagrangeK0(
          fusedLinearPlusScaled(rD, gD, linearCoefficients, scale, "x"),
          options.shape.xSize,
        )),
      await record(options, "current-term3-y", async () =>
        multiplyByLagrangeK0(
          await currentInnerY(rD, gD, linearCoefficients, scale),
          options.shape.xSize,
        )),
      await record(options, "fused-term3-y", () =>
        multiplyByLagrangeK0(
          fusedLinearPlusScaled(rD, gD, linearCoefficients, scale, "y"),
          options.shape.xSize,
        )),
    ];

    console.table(records.map((entry) => ({
      candidate: entry.candidate,
      shape: entry.shape,
      "ms/op": entry.ms.toFixed(3),
    })));
    await writeReport(options, records);
  } finally {
    await runtime.terminate();
  }
}

async function currentInnerX(
  rD: BivariatePolynomialBuffer,
  gD: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
  scale: FieldElement,
): Promise<BivariatePolynomialBuffer> {
  return (await mulByLinearX(rD, coefficients)).add(gD.scale(scale));
}

async function currentInnerY(
  rD: BivariatePolynomialBuffer,
  gD: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
  scale: FieldElement,
): Promise<BivariatePolynomialBuffer> {
  return (await mulByLinearY(rD, coefficients)).add(gD.scale(scale));
}

function fusedLinearPlusScaled(
  rD: BivariatePolynomialBuffer,
  gD: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
  scale: FieldElement,
  axis: "x" | "y",
): BivariatePolynomialBuffer {
  if (rD.field !== gD.field || coefficients.length !== 2) {
    throw new Error("Fused linear inputs must use one field and two linear coefficients.");
  }
  const degree = rD.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return gD.scale(scale);
  }

  const field = rD.field;
  const xSize = axis === "x"
    ? Math.max(rD.xSize, nextPowerOfTwo(degree.xDegree + 2))
    : rD.xSize;
  const ySize = axis === "y"
    ? Math.max(rD.ySize, nextPowerOfTwo(degree.yDegree + 2))
    : rD.ySize;
  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const outputRowBytes = ySize * field.byteLength;
  const sourceRowBytes = rD.ySize * field.byteLength;
  const gRowBytes = gD.ySize * field.byteLength;

  for (let x = 0; x < xSize; x += 1) {
    const outputRowOffset = x * outputRowBytes;
    for (let y = 0; y < ySize; y += 1) {
      let value = field.zero;
      if (axis === "x") {
        if (x <= degree.xDegree && y <= degree.yDegree) {
          const offset = x * sourceRowBytes + y * field.byteLength;
          value = field.mul(rD.coefficients.subarray(offset, offset + field.byteLength), coefficients[0]);
        }
        if (x > 0 && x - 1 <= degree.xDegree && y <= degree.yDegree) {
          const offset = (x - 1) * sourceRowBytes + y * field.byteLength;
          const shifted = field.mul(rD.coefficients.subarray(offset, offset + field.byteLength), coefficients[1]);
          value = field.add(value, shifted);
        }
      } else {
        if (x <= degree.xDegree && y <= degree.yDegree) {
          const offset = x * sourceRowBytes + y * field.byteLength;
          value = field.mul(rD.coefficients.subarray(offset, offset + field.byteLength), coefficients[0]);
        }
        if (x <= degree.xDegree && y > 0 && y - 1 <= degree.yDegree) {
          const offset = x * sourceRowBytes + (y - 1) * field.byteLength;
          const shifted = field.mul(rD.coefficients.subarray(offset, offset + field.byteLength), coefficients[1]);
          value = field.add(value, shifted);
        }
      }
      if (x < gD.xSize && y < gD.ySize && !field.isZero(scale)) {
        const offset = x * gRowBytes + y * field.byteLength;
        value = field.add(
          value,
          field.mul(gD.coefficients.subarray(offset, offset + field.byteLength), scale),
        );
      }
      output.set(value, outputRowOffset + y * field.byteLength);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

function patternedPolynomial(field: FieldRuntime, shape: Shape, seed: bigint): BivariatePolynomialBuffer {
  const values = Array.from({ length: 16 }, (_, index) => field.fromBigInt(seed + BigInt(index + 1)));
  const output = field.createZeroBuffer(shape.xSize * shape.ySize);
  for (let index = 0; index < shape.xSize * shape.ySize; index += 1) {
    field.writeBufferElement(output, index, values[index % values.length]);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, shape.xSize, shape.ySize);
}

async function record(
  options: Options,
  candidate: string,
  callback: () => BivariatePolynomialBuffer | Promise<BivariatePolynomialBuffer>,
): Promise<Record> {
  for (let index = 0; index < options.warmup; index += 1) {
    await callback();
  }
  const start = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    await callback();
  }
  return {
    candidate,
    shape: formatShape(options.shape),
    ms: (performance.now() - start) / options.iterations,
  };
}

function parseOptions(args: readonly string[]): Options {
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unknown argument '${arg}'.`);
    }
    values.set(match[1], match[2]);
  }
  return {
    shape: parseShape(values.get("shape") ?? "16x16"),
    iterations: parseInteger(values.get("iterations") ?? "2", "iterations", true),
    warmup: parseInteger(values.get("warmup") ?? "1", "warmup", false),
    jsonPath: values.get("json") ?? "tmp/timing/copy-linear-fusion.json",
  };
}

function parseShape(value: string): Shape {
  const match = /^([0-9]+)x([0-9]+)$/.exec(value);
  if (match === null) {
    throw new Error(`Invalid shape '${value}'.`);
  }
  return {
    xSize: parseInteger(match[1], "xSize", true),
    ySize: parseInteger(match[2], "ySize", true),
  };
}

function parseInteger(value: string, label: string, positive: boolean): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (positive && parsed === 0)) {
    throw new Error(`${label} is outside the supported range.`);
  }
  return parsed;
}

function nextPowerOfTwo(value: number): number {
  let output = 1;
  while (output < value) {
    output *= 2;
  }
  return output;
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label}: byte length mismatch.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label}: byte mismatch at offset ${index}.`);
    }
  }
}

function formatShape(shape: Shape): string {
  return `${shape.xSize}x${shape.ySize}`;
}

async function writeReport(options: Options, records: readonly Record[]): Promise<void> {
  const outputPath = path.resolve(options.jsonPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    options: {
      shape: formatShape(options.shape),
      iterations: options.iterations,
      warmup: options.warmup,
    },
    records,
  }, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
