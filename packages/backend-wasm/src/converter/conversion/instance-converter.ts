import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../artifacts/binary/binary-format.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import { GENERATED_SETUP_PARAMS } from "../../generated/setup.generated.js";
import { concatBytes } from "../../runtime/bytes.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { isRecord, parseHexStringArray } from "./conversion-utils.js";
import { withCurveRuntime } from "./conversion-runtime.js";

interface VerifierSetupParamsJson {
  readonly l_free: number;
  readonly l_user: number;
  readonly l: number;
}

interface InstanceJson {
  readonly a_pub_user: readonly string[];
  readonly a_pub_block: readonly string[];
  readonly a_pub_function: readonly string[];
}

export async function convertInstance(instance: unknown): Promise<Uint8Array> {
  return withCurveRuntime((runtime) =>
    createInstanceArtifact(runtime, instance, BACKEND_WASM_PACKAGE_VERSION));
}

async function createInstanceArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const instance = parseInstanceJson(raw);
  const publicInstance = readPublicInstance(runtime, instance, GENERATED_SETUP_PARAMS);
  const functionInstance = readFunctionInstance(
    runtime,
    instance,
    GENERATED_SETUP_PARAMS,
  );

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.Instance,
    sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.Instance,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "instance.public",
        elementCount: publicInstance.length,
        elementByteLength: runtime.Fr.byteLength,
        data: concatBytes(publicInstance),
      },
      {
        type: BinarySectionType.Instance,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "instance.function",
        elementCount: functionInstance.length,
        elementByteLength: runtime.Fr.byteLength,
        data: concatBytes(functionInstance),
      },
    ],
  });
}

function readPublicInstance(
  runtime: CurveRuntime,
  instance: InstanceJson,
  setup: VerifierSetupParamsJson,
): readonly Uint8Array[] {
  const publicInstance = [
    ...instance.a_pub_user.slice(0, setup.l_user),
    ...instance.a_pub_block.slice(0, setup.l_free - setup.l_user),
  ];

  if (publicInstance.length !== setup.l_free) {
    throw new Error("Verifier public instance length does not match setupParams.l_free.");
  }

  return publicInstance.map((value) => runtime.Fr.fromHex(value));
}

function readFunctionInstance(
  runtime: CurveRuntime,
  instance: InstanceJson,
  setup: VerifierSetupParamsJson,
): readonly Uint8Array[] {
  const expectedLength = setup.l - setup.l_free;
  if (instance.a_pub_function.length !== expectedLength) {
    throw new Error(
      `Function instance length must equal setupParams.l - setupParams.l_free (${expectedLength}).`,
    );
  }

  return instance.a_pub_function.map((value) => runtime.Fr.fromHex(value));
}

function parseInstanceJson(raw: unknown): InstanceJson {
  if (!isRecord(raw)) {
    throw new Error("Instance JSON must be an object.");
  }

  return {
    a_pub_user: parseHexStringArray(raw.a_pub_user, "instance.a_pub_user"),
    a_pub_block: parseHexStringArray(raw.a_pub_block, "instance.a_pub_block"),
    a_pub_function: parseHexStringArray(raw.a_pub_function, "instance.a_pub_function"),
  };
}
