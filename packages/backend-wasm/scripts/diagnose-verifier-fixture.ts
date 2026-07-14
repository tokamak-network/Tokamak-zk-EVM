import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCurveRuntime,
  decodeVerifierBinaryResult,
  loadRuntimeArtifactFile,
  loadVerifierInputFromRuntimeBundles,
  parseRuntimeArtifactBundleManifest,
  verifyBinary,
  type RuntimeArtifactBundleManifest,
} from "../src/index.js";
import {
  GENERATED_PROVER_SETUP_PARAMS,
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../src/prover/generated/subcircuit-library.generated.js";
import { GENERATED_VERIFIER_SIGMA } from "../src/verifier/generated/sigma-verify.generated.js";
import { verifySnark } from "../src/verifier/verify-snark.js";

interface CopyManifest {
  readonly schemaVersion: 2;
  readonly suite: string;
  readonly workDirectory: string;
}

interface DigestReport {
  readonly label: string;
  readonly path?: string;
  readonly byteLength: number;
  readonly sha256: string;
}

interface RuntimeArtifactReport extends DigestReport {
  readonly kind: number;
  readonly formatVersion: number;
  readonly sourcePackageVersion: string;
  readonly sections: readonly RuntimeArtifactSectionReport[];
}

interface RuntimeArtifactSectionReport {
  readonly label: string;
  readonly type: number;
  readonly encoding: number;
  readonly elementCount: number;
  readonly elementByteLength: number;
  readonly byteLength: number;
  readonly sha256: string;
}

interface DiagnosisReport {
  readonly suite: string;
  readonly repositoryRootVersion: string;
  readonly nativeBackendVersion: string;
  readonly subcircuitLibraryPackageVersion: string;
  readonly copiedSourceRoot: string;
  readonly preparedRuntimeRoot: string;
  readonly sourceArtifacts: readonly DigestReport[];
  readonly generatedArtifacts: readonly DigestReport[];
  readonly runtimeArtifacts: readonly RuntimeArtifactReport[];
  readonly verifierResults: {
    readonly verifyBinary: boolean;
    readonly verifySnark: boolean;
  };
  readonly conclusion: string;
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.length !== 1) {
    throw new Error("Usage: diagnose-verifier-fixture <copy-manifest.json>");
  }

  const manifestPath = path.resolve(argv[0]);
  const manifestDirectory = path.dirname(manifestPath);
  const backendWasmRoot = path.resolve(manifestDirectory, "../..");
  const repositoryRoot = path.resolve(backendWasmRoot, "../..");
  const manifest = parseCopyManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const sourceRoot = resolveWorkDirectory(repositoryRoot, backendWasmRoot, manifest.workDirectory);
  const runtimeRoot = path.join(backendWasmRoot, "fixtures", manifest.suite, "runtime");
  const repositoryRootVersion = await readRootPackageVersion(repositoryRoot);
  const runtime = await createCurveRuntime();

  try {
    const proofManifest = parseRuntimeArtifactBundleManifest(
      await readJson(path.join(runtimeRoot, "verifier-proof-input", "manifest.json")),
    );
    const setupManifest = parseRuntimeArtifactBundleManifest(
      await readJson(path.join(runtimeRoot, "verifier-setup-input", "manifest.json")),
    );
    const resolveFile = (artifactPath: string): Promise<Uint8Array> =>
      readPreparedRuntimeFile(runtimeRoot, artifactPath);
    const verifierInput = await loadVerifierInputFromRuntimeBundles(runtime, proofManifest, setupManifest, resolveFile);
    const binaryResult = decodeVerifierBinaryResult(
      await verifyBinary(runtime, proofManifest, setupManifest, resolveFile, {
        randomScalar: () => runtime.Fr.one,
      }),
    );
    const snarkResult = await verifySnark(runtime, verifierInput, {
      randomScalar: () => runtime.Fr.one,
    });

    const report: DiagnosisReport = {
      suite: manifest.suite,
      repositoryRootVersion,
      nativeBackendVersion: NATIVE_BACKEND_VERSION,
      subcircuitLibraryPackageVersion: SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
      copiedSourceRoot: path.relative(process.cwd(), sourceRoot),
      preparedRuntimeRoot: path.relative(process.cwd(), runtimeRoot),
      sourceArtifacts: await readSourceArtifactReports(sourceRoot),
      generatedArtifacts: [
        digestBytes("generated.setupParams", encodeUtf8(stableJsonStringify(GENERATED_PROVER_SETUP_PARAMS))),
        digestBytes("generated.sigmaVerify", concatVerifierSigmaBytes()),
      ],
      runtimeArtifacts: await readRuntimeArtifactReports(runtimeRoot, proofManifest, setupManifest),
      verifierResults: {
        verifyBinary: binaryResult,
        verifySnark: snarkResult.valid,
      },
      conclusion: buildConclusion(binaryResult, snarkResult.valid),
    };

    console.log(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await runtime.terminate();
  }
}

function parseCopyManifest(raw: unknown): CopyManifest {
  if (!isRecord(raw)) {
    throw new Error("Copy manifest must be a JSON object.");
  }

  if (raw.schemaVersion !== 2) {
    throw new Error("Copy manifest schemaVersion must be 2.");
  }

  if (typeof raw.suite !== "string" || raw.suite.trim() === "") {
    throw new Error("Copy manifest suite must be a non-empty string.");
  }

  if (typeof raw.workDirectory !== "string" || raw.workDirectory.trim() === "" || path.isAbsolute(raw.workDirectory)) {
    throw new Error("Copy manifest workDirectory must be a non-empty relative path.");
  }

  return {
    schemaVersion: 2,
    suite: raw.suite,
    workDirectory: path.normalize(raw.workDirectory),
  };
}

function resolveWorkDirectory(repositoryRoot: string, backendWasmRoot: string, workDirectory: string): string {
  const workDirectoryPath = path.resolve(repositoryRoot, workDirectory);
  const allowedRoot = path.resolve(backendWasmRoot, "tmp", "fixture-work");

  if (!isPathInside(workDirectoryPath, allowedRoot)) {
    throw new Error(`Copy manifest workDirectory must stay under packages/backend-wasm/tmp/fixture-work: ${workDirectory}`);
  }

  return workDirectoryPath;
}

async function readSourceArtifactReports(sourceRoot: string): Promise<readonly DigestReport[]> {
  const artifacts = [
    ["source.proof", "prove/proof.json"],
    ["source.preprocess", "preprocess/preprocess.json"],
    ["source.instance", "synthesizer/instance.json"],
    ["source.permutation", "synthesizer/permutation.json"],
    ["source.placementVariables", "synthesizer/placementVariables.json"],
    ["source.sigmaVerify", "setup/sigma_verify.json"],
    ["source.sigmaPreprocess", "setup/sigma_preprocess.rkyv"],
    ["source.combinedSigma", "setup/combined_sigma.rkyv"],
  ] as const;

  return Promise.all(
    artifacts.map(async ([label, relativePath]) =>
      digestFile(label, path.join(sourceRoot, relativePath)),
    ),
  );
}

async function readRuntimeArtifactReports(
  runtimeRoot: string,
  proofManifest: RuntimeArtifactBundleManifest,
  setupManifest: RuntimeArtifactBundleManifest,
): Promise<readonly RuntimeArtifactReport[]> {
  const entries = [
    ...proofManifest.files.map((file) => [`runtime.${proofManifest.kind}.${file.role}`, file.path] as const),
    ...setupManifest.files.map((file) => [`runtime.${setupManifest.kind}.${file.role}`, file.path] as const),
  ];

  return Promise.all(
    entries.map(async ([label, artifactPath]) => {
      const filePath = resolvePreparedRuntimePath(runtimeRoot, artifactPath);
      const bytes = await readFile(filePath);
      const artifact = await loadRuntimeArtifactFile(bytes);

      return {
        ...digestBytes(label, bytes, path.relative(process.cwd(), filePath)),
        kind: artifact.kind,
        formatVersion: artifact.formatVersion,
        sourcePackageVersion: artifact.sourcePackageVersion,
        sections: artifact.sections.map((section) => ({
          label: section.label,
          type: section.type,
          encoding: section.encoding,
          elementCount: section.elementCount,
          elementByteLength: section.elementByteLength,
          byteLength: section.byteLength,
          sha256: sha256Hex(section.data),
        })),
      };
    }),
  );
}

async function digestFile(label: string, filePath: string): Promise<DigestReport> {
  const bytes = await readFile(filePath);
  return digestBytes(label, bytes, path.relative(process.cwd(), filePath));
}

function digestBytes(label: string, bytes: Uint8Array, filePath?: string): DigestReport {
  return {
    label,
    path: filePath,
    byteLength: bytes.byteLength,
    sha256: sha256Hex(bytes),
  };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function concatVerifierSigmaBytes(): Uint8Array {
  return concatBytes([
    GENERATED_VERIFIER_SIGMA.G,
    GENERATED_VERIFIER_SIGMA.H,
    GENERATED_VERIFIER_SIGMA.sigma1.x,
    GENERATED_VERIFIER_SIGMA.sigma1.y,
    GENERATED_VERIFIER_SIGMA.sigma2.alpha,
    GENERATED_VERIFIER_SIGMA.sigma2.alpha2,
    GENERATED_VERIFIER_SIGMA.sigma2.alpha3,
    GENERATED_VERIFIER_SIGMA.sigma2.alpha4,
    GENERATED_VERIFIER_SIGMA.sigma2.gamma,
    GENERATED_VERIFIER_SIGMA.sigma2.delta,
    GENERATED_VERIFIER_SIGMA.sigma2.eta,
    GENERATED_VERIFIER_SIGMA.sigma2.x,
    GENERATED_VERIFIER_SIGMA.sigma2.y,
    GENERATED_VERIFIER_SIGMA.lagrangeKL,
  ]);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function readRootPackageVersion(repositoryRoot: string): Promise<string> {
  const packageJson = await readJson(path.join(repositoryRoot, "package.json"));

  if (!isRecord(packageJson) || typeof packageJson.version !== "string" || packageJson.version.trim() === "") {
    throw new Error("Repository root package.json must define a non-empty version.");
  }

  return packageJson.version;
}

async function readPreparedRuntimeFile(runtimeRoot: string, artifactPath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolvePreparedRuntimePath(runtimeRoot, artifactPath)));
}

function resolvePreparedRuntimePath(runtimeRoot: string, artifactPath: string): string {
  if (path.isAbsolute(artifactPath) || artifactPath.includes("\\") || artifactPath.split("/").includes("..")) {
    throw new Error(`Prepared runtime artifact path must be a safe relative POSIX path: ${artifactPath}`);
  }

  const filePath = path.resolve(runtimeRoot, artifactPath);
  if (!isPathInside(filePath, runtimeRoot)) {
    throw new Error(`Prepared runtime artifact path escapes fixtures runtime root: ${artifactPath}`);
  }

  return filePath;
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function buildConclusion(binaryResult: boolean, snarkResult: boolean): string {
  if (binaryResult && snarkResult) {
    return "The prepared verifier runtime fixture is accepted by both verifyBinary and verifySnark.";
  }

  if (!binaryResult && !snarkResult) {
    return [
      "Both verifyBinary and decoded-input verifySnark rejected the prepared verifier runtime fixture.",
      "This points to source artifact inconsistency or a verifier-core protocol mismatch, not just binary bundle assembly.",
    ].join(" ");
  }

  return [
    "verifyBinary and decoded-input verifySnark disagree.",
    "This points to binary bundle loading or binary artifact conversion before verifier-core execution.",
  ].join(" ");
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Verifier fixture diagnosis failed: ${message}`);
    process.exitCode = 1;
  });
}
