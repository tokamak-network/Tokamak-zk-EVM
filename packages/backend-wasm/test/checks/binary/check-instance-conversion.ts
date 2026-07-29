import { createBinaryArtifactFile, decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../../src/artifacts/binary/binary-format.js";
import { convertInstance } from "../../../src/converter/conversion/instance-converter.js";
import { validateBinary } from "../../../src/converter/index.js";
import { GENERATED_SETUP_PARAMS } from "../../../src/generated/setup.generated.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../../src/version.js";
import { assertEqual } from "../../support/assertions.js";
import { assertBytesEqual, concatBytes } from "../../support/bytes.js";

const setup = GENERATED_SETUP_PARAMS;

async function main(): Promise<void> {
  const source = {
    a_pub_user: hexValues(setup.l_user, 1),
    a_pub_block: hexValues(setup.l_free - setup.l_user, 1_001),
    a_pub_function: hexValues(setup.l - setup.l_free, 2_001),
  };
  const binary = await convertInstance(source);
  const artifact = await decodeBinaryArtifactFile(binary);
  await validateBinary(binary);
  await assertSlicedInputAccepted(binary);

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
    sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
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
    () => validateBinary(oldBinary),
    "validateBinary could not process its input.",
    "instance is missing required section 'instance.function'.",
  );
}

async function assertSlicedInputAccepted(binary: Uint8Array): Promise<void> {
  const padded = new Uint8Array(binary.byteLength + 9);
  padded.set(binary, 5);
  const sliced = padded.subarray(5, 5 + binary.byteLength);
  const artifact = decodeBinaryArtifactFile(sliced);
  assertEqual(artifact.byteLength, binary.byteLength, "sliced instance byte length");
  assertEqual(artifact.sections[0].data.byteLength, setup.l_free * 32, "sliced public section length");
  await validateBinary(sliced);
}

function hexValues(length: number, start: number): readonly string[] {
  return Array.from({ length }, (_, index) => `0x${(start + index).toString(16)}`);
}

async function assertRejects(
  action: () => Promise<unknown>,
  expectedMessage: string,
  expectedCauseMessage?: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== expectedMessage) {
      throw new Error(`Expected '${expectedMessage}', got '${message}'.`);
    }
    if (expectedCauseMessage !== undefined) {
      const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
      const causeMessage = cause instanceof Error ? cause.message : String(cause);
      if (causeMessage !== expectedCauseMessage) {
        throw new Error(`Expected cause '${expectedCauseMessage}', got '${causeMessage}'.`);
      }
    }
    return;
  }

  throw new Error(`Expected rejection '${expectedMessage}'.`);
}

await main();
