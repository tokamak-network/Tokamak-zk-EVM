import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../artifacts/binary/binary-format.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import { GENERATED_PROVER_SETUP_PARAMS } from "../../prover/generated/subcircuit-library.generated.js";
import { createCurveRuntime, type CurveRuntime } from "../../runtime/curve/curve.js";
import { concatBytes, isRecord, parseHexStringArray } from "./conversion-utils.js";

interface VerifierSetupParamsJson {
  readonly l_free: number;
  readonly l_user: number;
}

interface InstanceJson {
  readonly a_pub_user: readonly string[];
  readonly a_pub_block: readonly string[];
}

export async function convertInstance(instance: unknown): Promise<Uint8Array> {
  const runtime = await createCurveRuntime();
  try {
    return createInstanceArtifact(runtime, instance, BACKEND_WASM_PACKAGE_VERSION);
  } finally {
    await runtime.terminate();
  }
}

async function createInstanceArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const publicInstance = readPublicInstance(runtime, raw, GENERATED_PROVER_SETUP_PARAMS);

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
    ],
  });
}

function readPublicInstance(
  runtime: CurveRuntime,
  raw: unknown,
  setup: VerifierSetupParamsJson,
): readonly Uint8Array[] {
  const instance = parseInstanceJson(raw);
  const publicInstance = [
    ...instance.a_pub_user.slice(0, setup.l_user),
    ...instance.a_pub_block.slice(0, setup.l_free - setup.l_user),
  ];

  if (publicInstance.length !== setup.l_free) {
    throw new Error("Verifier public instance length does not match setupParams.l_free.");
  }

  return publicInstance.map((value) => runtime.Fr.fromHex(value));
}

function parseInstanceJson(raw: unknown): InstanceJson {
  if (!isRecord(raw)) {
    throw new Error("Verifier instance JSON must be an object.");
  }

  return {
    a_pub_user: parseHexStringArray(raw.a_pub_user, "instance.a_pub_user"),
    a_pub_block: parseHexStringArray(raw.a_pub_block, "instance.a_pub_block"),
  };
}
