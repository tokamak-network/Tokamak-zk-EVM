import { createBinaryArtifactFile, decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../../src/artifacts/binary/binary-format.js";
import { INSTANCE_V1_SPEC } from "../../../src/artifacts/specs/instance.v1.generated.js";
import { convertInstance } from "../../../src/converter/conversion/instance-converter.js";
import { validateRuntimeArtifactFile } from "../../../src/converter/validation/validators.js";
import { GENERATED_PROVER_SETUP_PARAMS } from "../../../src/prover/generated/subcircuit-library.generated.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";

const setup = GENERATED_PROVER_SETUP_PARAMS;

async function main(): Promise<void> {
  const source = {
    a_pub_user: hexValues(setup.l_user, 1),
    a_pub_block: hexValues(setup.l_free - setup.l_user, 1_001),
    a_pub_function: hexValues(setup.l - setup.l_free, 2_001),
  };
  const binary = await convertInstance(source);
  const artifact = await decodeBinaryArtifactFile(binary);
  await validateRuntimeArtifactFile(binary, INSTANCE_V1_SPEC, {
    expectedKind: BinaryArtifactFileKind.Instance,
  });

  assertEqual(artifact.sections.length, 2, "instance section count");
  assertSection(artifact.sections[0], "instance.public", setup.l_free);
  assertSection(artifact.sections[1], "instance.function", setup.l - setup.l_free);

  const runtime = await createCurveRuntime();
  try {
    const expectedPublic = [
      ...source.a_pub_user,
      ...source.a_pub_block,
    ].map((value) => runtime.Fr.fromHex(value));
    const expectedFunction = source.a_pub_function.map((value) => runtime.Fr.fromHex(value));

    assertBytesEqual(artifact.sections[0].data, concatBytes(expectedPublic), "instance.public");
    assertBytesEqual(artifact.sections[1].data, concatBytes(expectedFunction), "instance.function");
  } finally {
    await runtime.terminate();
  }

  await assertRejects(
    () => convertInstance({
      ...source,
      a_pub_function: source.a_pub_function.slice(1),
    }),
    "Function instance length must equal setupParams.l - setupParams.l_free (600).",
  );
  await assertOldInstanceRejected();

  console.log("Checked public and function instance conversion and legacy rejection");
}

function assertSection(
  section: {
    readonly label: string;
    readonly type: BinarySectionType;
    readonly encoding: BinarySectionEncoding;
    readonly elementCount: number;
    readonly elementByteLength: number;
  },
  label: string,
  elementCount: number,
): void {
  assertEqual(section.label, label, `${label} label`);
  assertEqual(section.type, BinarySectionType.Instance, `${label} type`);
  assertEqual(section.encoding, BinarySectionEncoding.FfjsFrMontgomeryLe32, `${label} encoding`);
  assertEqual(section.elementCount, elementCount, `${label} element count`);
  assertEqual(section.elementByteLength, 32, `${label} element width`);
}

async function assertOldInstanceRejected(): Promise<void> {
  const oldBinary = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.Instance,
    sourcePackageVersion: "2.1.3",
    sections: [
      {
        type: BinarySectionType.Instance,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "instance.public",
        elementCount: setup.l_free,
        elementByteLength: 32,
        data: new Uint8Array(setup.l_free * 32),
      },
    ],
  });

  await assertRejects(
    () => validateRuntimeArtifactFile(oldBinary, INSTANCE_V1_SPEC, {
      expectedKind: BinaryArtifactFileKind.Instance,
    }),
    "instance is missing required section 'instance.function'.",
  );
}

function hexValues(length: number, start: number): readonly string[] {
  return Array.from({ length }, (_, index) => `0x${(start + index).toString(16)}`);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label} byte length mismatch.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label} byte mismatch at offset ${index}.`);
    }
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

async function assertRejects(
  action: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== expectedMessage) {
      throw new Error(`Expected '${expectedMessage}', got '${message}'.`);
    }
    return;
  }

  throw new Error(`Expected rejection '${expectedMessage}'.`);
}

await main();
