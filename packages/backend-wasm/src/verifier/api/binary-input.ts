import { loadRuntimeArtifactFile } from "../../artifacts/loaders/loaders.js";
import {
  loadVerifierPreprocessArtifact,
  loadVerifierProofArtifact,
} from "../../artifacts/loaders/prepared-data.js";
import type { RuntimeArtifactFile } from "../../artifacts/loaders/types.js";
import { DensePolynomialExt } from "../../core/polynomial/dense-polynomial.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";
import {
  RuntimeArtifactFileRole,
  type RuntimeArtifactBundleFile,
  type RuntimeArtifactBundleManifest,
} from "../../artifacts/bundles/artifact-bundle.js";
import { BinarySectionEncoding, BinarySectionType } from "../../artifacts/format/binary-format.js";
import { GENERATED_PROVER_SETUP_PARAMS } from "../../prover/generated/subcircuit-library.generated.js";
import type { VerifierSetupParams } from "../equations/domain-context.js";
import { GENERATED_VERIFIER_SIGMA } from "../generated/sigma-verify.generated.js";
import type { VerifierInput, VerifierProof } from "../internal/verify-snark.js";

export type RuntimeArtifactFileResolver = (path: string) => Uint8Array | Promise<Uint8Array>;

export interface VerifierRuntimeArtifactFiles {
  readonly instance: RuntimeArtifactFile;
  readonly proof: RuntimeArtifactFile;
  readonly preprocess: RuntimeArtifactFile;
}

export async function loadVerifierInputFromRuntimeBundles(
  runtime: CurveRuntime,
  proofInput: RuntimeArtifactBundleManifest,
  setupInput: RuntimeArtifactBundleManifest,
  resolveFile: RuntimeArtifactFileResolver,
): Promise<VerifierInput> {
  const artifacts: VerifierRuntimeArtifactFiles = {
    instance: await loadBundleArtifactFile(
      proofInput,
      RuntimeArtifactFileRole.Instance,
      resolveFile,
    ),
    proof: await loadBundleArtifactFile(
      proofInput,
      RuntimeArtifactFileRole.Proof,
      resolveFile,
    ),
    preprocess: await loadBundleArtifactFile(
      setupInput,
      RuntimeArtifactFileRole.Preprocess,
      resolveFile,
    ),
  };

  return buildVerifierInputFromRuntimeArtifacts(runtime, artifacts);
}

export async function buildVerifierInputFromRuntimeArtifacts(
  runtime: CurveRuntime,
  artifacts: VerifierRuntimeArtifactFiles,
): Promise<VerifierInput> {
  const setup = GENERATED_PROVER_SETUP_PARAMS satisfies VerifierSetupParams;
  const publicInstance = parsePublicInstance(runtime, artifacts.instance);

  return {
    setup,
    sigma: GENERATED_VERIFIER_SIGMA,
    preprocess: parseVerifierPreprocess(artifacts.preprocess),
    proof: parseVerifierProof(artifacts.proof),
    aPubX: await DensePolynomialExt.fromRouEvals(runtime.Fr, publicInstance, setup.l_free, 1),
  };
}

async function loadBundleArtifactFile(
  manifest: RuntimeArtifactBundleManifest,
  role: RuntimeArtifactFileRole,
  resolveFile: RuntimeArtifactFileResolver,
): Promise<RuntimeArtifactFile> {
  const file = requireSingleRoleFile(manifest, role);
  const bytes = await resolveFile(file.path);
  return loadRuntimeArtifactFile(bytes);
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

function parsePublicInstance(
  runtime: CurveRuntime,
  instanceFile: RuntimeArtifactFile,
): readonly FieldElement[] {
  const section = requireSection(instanceFile, {
    type: BinarySectionType.Instance,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "instance.public",
  });

  return splitElements(section.data, runtime.Fr.byteLength);
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
