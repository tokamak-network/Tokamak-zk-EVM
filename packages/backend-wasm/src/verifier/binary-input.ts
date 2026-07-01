import { loadRuntimeArtifactFile } from "../libs/artifact-loaders/loaders.js";
import {
  loadVerifierInstanceArtifact,
  loadVerifierPreprocessArtifact,
  loadVerifierProofArtifact,
} from "../libs/artifact-loaders/prepared-data.js";
import { loadSigmaVerifyArtifact } from "../libs/artifact-loaders/sigma-verify.js";
import type { RuntimeArtifactFile } from "../libs/artifact-loaders/types.js";
import { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import {
  assertVerifierProofInputBundle,
  assertVerifierSetupInputBundle,
  RuntimeArtifactFileRole,
  type RuntimeArtifactBundleFile,
  type RuntimeArtifactBundleManifest,
} from "../libs/serialization/artifact-bundle.js";
import { BinaryArtifactFileKind, BinarySectionEncoding, BinarySectionType } from "../libs/serialization/binary-format.js";
import type { VerifierSetupParams } from "./domain-context.js";
import type { VerifierInput, VerifierProof } from "./verify-snark.js";

export type RuntimeArtifactFileResolver = (path: string) => Uint8Array | Promise<Uint8Array>;

export interface VerifierRuntimeArtifactFiles {
  readonly instance: RuntimeArtifactFile;
  readonly proof: RuntimeArtifactFile;
  readonly crs: RuntimeArtifactFile;
  readonly preprocess: RuntimeArtifactFile;
}

export async function loadVerifierInputFromRuntimeBundles(
  runtime: CurveRuntime,
  proofInput: RuntimeArtifactBundleManifest,
  setupInput: RuntimeArtifactBundleManifest,
  resolveFile: RuntimeArtifactFileResolver,
): Promise<VerifierInput> {
  assertVerifierProofInputBundle(proofInput);
  assertVerifierSetupInputBundle(setupInput);

  const artifacts: VerifierRuntimeArtifactFiles = {
    instance: await loadBundleArtifactFile(
      proofInput,
      RuntimeArtifactFileRole.Instance,
      BinaryArtifactFileKind.VerifierInstance,
      resolveFile,
    ),
    proof: await loadBundleArtifactFile(
      proofInput,
      RuntimeArtifactFileRole.Proof,
      BinaryArtifactFileKind.VerifierProof,
      resolveFile,
    ),
    crs: await loadBundleArtifactFile(
      setupInput,
      RuntimeArtifactFileRole.Crs,
      BinaryArtifactFileKind.VerifierCrs,
      resolveFile,
    ),
    preprocess: await loadBundleArtifactFile(
      setupInput,
      RuntimeArtifactFileRole.Preprocess,
      BinaryArtifactFileKind.VerifierPreprocess,
      resolveFile,
    ),
  };

  return buildVerifierInputFromRuntimeArtifacts(runtime, artifacts);
}

export async function buildVerifierInputFromRuntimeArtifacts(
  runtime: CurveRuntime,
  artifacts: VerifierRuntimeArtifactFiles,
): Promise<VerifierInput> {
  assertArtifactKind(artifacts.instance, BinaryArtifactFileKind.VerifierInstance, "verifier instance");
  assertArtifactKind(artifacts.proof, BinaryArtifactFileKind.VerifierProof, "verifier proof");
  assertArtifactKind(artifacts.crs, BinaryArtifactFileKind.VerifierCrs, "verifier CRS");
  assertArtifactKind(artifacts.preprocess, BinaryArtifactFileKind.VerifierPreprocess, "verifier preprocess");

  const setup = parseSetupParams(artifacts.preprocess);
  const publicInstance = parsePublicInstance(runtime, artifacts.instance, setup);

  return {
    setup,
    sigma: parseSigmaVerify(artifacts.crs),
    preprocess: parseVerifierPreprocess(artifacts.preprocess),
    proof: parseVerifierProof(artifacts.proof),
    aPubX: await DensePolynomialExt.fromRouEvals(runtime.Fr, publicInstance, setup.l_free, 1),
  };
}

async function loadBundleArtifactFile(
  manifest: RuntimeArtifactBundleManifest,
  role: RuntimeArtifactFileRole,
  expectedKind: BinaryArtifactFileKind,
  resolveFile: RuntimeArtifactFileResolver,
): Promise<RuntimeArtifactFile> {
  const file = requireSingleRoleFile(manifest, role);
  const bytes = await resolveFile(file.path);

  if (file.byteLength !== undefined && file.byteLength !== bytes.byteLength) {
    throw new Error(`Runtime bundle file '${file.path}' byteLength mismatch.`);
  }

  const artifactFile = await loadRuntimeArtifactFile(bytes);
  assertArtifactKind(artifactFile, expectedKind, `runtime bundle file '${file.path}'`);
  return artifactFile;
}

function requireSingleRoleFile(
  manifest: RuntimeArtifactBundleManifest,
  role: RuntimeArtifactFileRole,
): RuntimeArtifactBundleFile {
  const matches = manifest.files.filter((file) => file.role === role);
  if (matches.length !== 1) {
    throw new Error(`${manifest.kind} bundle must contain exactly one '${role}' artifact file.`);
  }

  return matches[0];
}

function parseSetupParams(preprocessFile: RuntimeArtifactFile): VerifierSetupParams {
  loadVerifierPreprocessArtifact(preprocessFile);
  const section = requireSection(preprocessFile, {
    type: BinarySectionType.SetupParams,
    encoding: BinarySectionEncoding.Bytes,
    label: "setup.params",
  });

  if (section.elementCount !== 1 || section.elementByteLength !== SETUP_PARAMS_BINARY_BYTES) {
    throw new Error("Verifier setup params section has invalid shape.");
  }

  const view = new DataView(section.data.buffer, section.data.byteOffset, section.data.byteLength);
  return {
    l_free: view.getUint32(0, true),
    l_user_out: view.getUint32(4, true),
    l_user: view.getUint32(8, true),
    l: view.getUint32(12, true),
    l_D: view.getUint32(16, true),
    m_D: view.getUint32(20, true),
    n: view.getUint32(24, true),
    s_D: view.getUint32(28, true),
    s_max: view.getUint32(32, true),
  };
}

function parsePublicInstance(
  runtime: CurveRuntime,
  instanceFile: RuntimeArtifactFile,
  setup: VerifierSetupParams,
): readonly FieldElement[] {
  loadVerifierInstanceArtifact(instanceFile);
  const section = requireSection(instanceFile, {
    type: BinarySectionType.Instance,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "instance.public",
  });

  if (section.elementCount !== setup.l_free) {
    throw new Error(
      `Verifier instance public input length mismatch: expected ${setup.l_free}, got ${section.elementCount}.`,
    );
  }

  return splitElements(section.data, runtime.Fr.byteLength);
}

function parseSigmaVerify(crsFile: RuntimeArtifactFile): VerifierInput["sigma"] {
  const sigma = loadSigmaVerifyArtifact(crsFile).pointsByName;

  return {
    G: requireEntry(sigma, "G"),
    H: requireEntry(sigma, "H"),
    sigma1: {
      x: requireEntry(sigma, "sigma1.x"),
      y: requireEntry(sigma, "sigma1.y"),
    },
    sigma2: {
      alpha: requireEntry(sigma, "sigma2.alpha"),
      alpha2: requireEntry(sigma, "sigma2.alpha2"),
      alpha3: requireEntry(sigma, "sigma2.alpha3"),
      alpha4: requireEntry(sigma, "sigma2.alpha4"),
      gamma: requireEntry(sigma, "sigma2.gamma"),
      delta: requireEntry(sigma, "sigma2.delta"),
      eta: requireEntry(sigma, "sigma2.eta"),
      x: requireEntry(sigma, "sigma2.x"),
      y: requireEntry(sigma, "sigma2.y"),
    },
    lagrangeKL: requireEntry(sigma, "lagrangeKL"),
  };
}

function parseVerifierPreprocess(preprocessFile: RuntimeArtifactFile): VerifierInput["preprocess"] {
  const preprocess = loadVerifierPreprocessArtifact(preprocessFile).pointsByName;

  return {
    s0: requireEntry(preprocess, "s0"),
    s1: requireEntry(preprocess, "s1"),
    O_pub_fix: requireEntry(preprocess, "O_pub_fix"),
  };
}

function parseVerifierProof(proofFile: RuntimeArtifactFile): VerifierProof {
  const proof = loadVerifierProofArtifact(proofFile).pointsByName;

  return {
    binding: {
      A_free: requireEntry(proof, "binding.A_free"),
      O_pub_free: requireEntry(proof, "binding.O_pub_free"),
      O_mid: requireEntry(proof, "binding.O_mid"),
      O_prv: requireEntry(proof, "binding.O_prv"),
    },
    proof0: {
      U: requireEntry(proof, "proof0.U"),
      V: requireEntry(proof, "proof0.V"),
      W: requireEntry(proof, "proof0.W"),
      Q_AX: requireEntry(proof, "proof0.Q_AX"),
      Q_AY: requireEntry(proof, "proof0.Q_AY"),
      B: requireEntry(proof, "proof0.B"),
    },
    proof1: {
      R: requireEntry(proof, "proof1.R"),
    },
    proof2: {
      Q_CX: requireEntry(proof, "proof2.Q_CX"),
      Q_CY: requireEntry(proof, "proof2.Q_CY"),
    },
    proof3: {
      R_eval: requireEntry(proof, "proof3.R_eval"),
      R_omegaX_eval: requireEntry(proof, "proof3.R_omegaX_eval"),
      R_omegaX_omegaY_eval: requireEntry(proof, "proof3.R_omegaX_omegaY_eval"),
      V_eval: requireEntry(proof, "proof3.V_eval"),
    },
    proof4: {
      Pi_X: requireEntry(proof, "proof4.Pi_X"),
      Pi_Y: requireEntry(proof, "proof4.Pi_Y"),
      M_X: requireEntry(proof, "proof4.M_X"),
      M_Y: requireEntry(proof, "proof4.M_Y"),
      N_X: requireEntry(proof, "proof4.N_X"),
      N_Y: requireEntry(proof, "proof4.N_Y"),
    },
  };
}

function requireSection(
  artifactFile: RuntimeArtifactFile,
  query: {
    readonly type: BinarySectionType;
    readonly encoding: BinarySectionEncoding;
    readonly label: string;
  },
): RuntimeArtifactFile["sections"][number] {
  const section = artifactFile.sections.find(
    (candidate) =>
      candidate.type === query.type && candidate.encoding === query.encoding && candidate.label === query.label,
  );

  if (section === undefined) {
    throw new Error(`Missing runtime artifact section: ${JSON.stringify(query)}.`);
  }

  return section;
}

function requireEntry(entries: Readonly<Record<string, Uint8Array>>, name: string): Uint8Array {
  const entry = entries[name];
  if (entry === undefined) {
    throw new Error(`Missing verifier runtime artifact entry '${name}'.`);
  }

  return entry;
}

function splitElements(data: Uint8Array, elementByteLength: number): Uint8Array[] {
  if (data.byteLength % elementByteLength !== 0) {
    throw new Error("Runtime artifact section byte length is not divisible by the expected element width.");
  }

  const elements: Uint8Array[] = [];
  for (let offset = 0; offset < data.byteLength; offset += elementByteLength) {
    elements.push(data.subarray(offset, offset + elementByteLength));
  }

  return elements;
}

function assertArtifactKind(artifactFile: RuntimeArtifactFile, expected: BinaryArtifactFileKind, label: string): void {
  if (artifactFile.kind !== expected) {
    throw new Error(`${label} has artifact kind ${artifactFile.kind}, expected ${expected}.`);
  }
}

export function encodeVerifierSetupParams(setup: VerifierSetupParams): Uint8Array {
  const output = new Uint8Array(SETUP_PARAMS_BINARY_BYTES);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const values = [
    setup.l_free,
    setup.l_user_out,
    setup.l_user,
    setup.l,
    setup.l_D,
    setup.m_D,
    setup.n,
    setup.s_D,
    setup.s_max,
  ];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
      throw new Error("Verifier setup params values must fit in unsigned 32-bit integers.");
    }

    view.setUint32(index * 4, value, true);
  }

  return output;
}

const SETUP_PARAMS_BINARY_BYTES = 36;
