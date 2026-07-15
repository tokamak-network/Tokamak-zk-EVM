import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BinaryArtifactFileKind,
  RollingKeccakTranscript,
  RuntimeArtifactFileRole,
  buildProverBinding,
  buildWitnessPolynomials,
  createCurveRuntime,
  createProverState,
  createVerifierProofArtifactFromProverOutput,
  loadRuntimeArtifactFile,
  loadProverInputFromRuntimeBundles,
  loadVerifierProofArtifact,
  parseRuntimeArtifactBundleManifest,
  prove0,
  prove1,
  prove2,
  prove3,
  prove4,
  type CurveRuntime,
  type FieldElement,
  type Prove4DebugOutput,
  type ProverRuntimeInput,
  type RuntimeArtifactBundleManifest,
} from "../src/index.js";

const PROOF_POINT_NAMES = [
  "proof0.U",
  "proof0.V",
  "proof0.W",
  "binding.O_mid",
  "binding.O_prv",
  "proof0.Q_AX",
  "proof0.Q_AY",
  "proof2.Q_CX",
  "proof2.Q_CY",
  "proof4.Pi_X",
  "proof4.Pi_Y",
  "proof0.B",
  "proof1.R",
  "proof4.M_Y",
  "proof4.M_X",
  "proof4.N_Y",
  "proof4.N_X",
  "binding.O_pub_free",
  "binding.A_free",
] as const;

const PROOF_EVAL_NAMES = [
  "proof3.R_eval",
  "proof3.R_omegaX_eval",
  "proof3.R_omegaX_omegaY_eval",
  "proof3.V_eval",
] as const;

async function main(): Promise<void> {
  const runtimeDir = path.resolve("fixtures/small/runtime");
  const sourceDir = path.resolve("tmp/fixture-work/small/source");
  const runtime = await createCurveRuntime();

  try {
    const proverProofWitnessInput = await readPreparedRuntimeManifest(
      runtimeDir,
      "prover-proof-witness-input/manifest.json",
    );
    const proverCrsPreparedData = await readPreparedRuntimeManifest(
      runtimeDir,
      "prover-crs-prepared-data/manifest.json",
    );
    const proverInput = await timed("load prover runtime bundles", () =>
      loadProverInputFromRuntimeBundles(
        runtime,
        proverProofWitnessInput,
        proverCrsPreparedData,
        (artifactPath) => readPreparedRuntimeFile(runtimeDir, artifactPath),
      ),
    );
    const proverOutput = await provePreparedInputWithTimings(runtime, proverInput);
    await compareGeneratedProofArtifact(runtime, proverOutput.proofArtifact, sourceDir);
    await compareProof4Debug(runtime, proverOutput.proof4Debug, sourceDir);
  } finally {
    await runtime.terminate();
  }

  console.log("Checked prover output parity against copied native owner outputs");
}

async function provePreparedInputWithTimings(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
): Promise<{ readonly proofArtifact: Uint8Array; readonly proof4Debug: Prove4DebugOutput }> {
  const witness = await timed("build witness polynomials", () => buildWitnessPolynomials(runtime.Fr, input.witness));
  const state = await timed("create prover state", () =>
    createProverState({
      runtime,
      setup: input.witness.setup,
      publicInstance: input.publicInstance,
      permutation: input.permutation,
      witness,
    }),
  );
  const binding = await timed("build prover binding", () =>
    buildProverBinding(
      runtime,
      input.crs,
      input.witness.setup,
      input.witness.placementVariables,
      input.witness.subcircuitInfos,
      state.instance,
      state.mixer,
    ),
  );
  const transcript = new RollingKeccakTranscript(runtime.Fr);
  const prove0Output = await timed("prove0", () => prove0(runtime, input.crs, state));
  const thetas = collectThetaChallenges(runtime, transcript, prove0Output.proof0);
  const prove1Output = await timed("prove1", () => prove1(runtime, input.crs, state, thetas));
  const kappa0 = collectKappa0Challenge(runtime, transcript, prove1Output.proof1);
  const prove2Output = await timed("prove2", () =>
    prove2({
      runtime,
      crs: input.crs,
      state,
      rXY: prove1Output.rXY,
      thetas,
      kappa0,
    }),
  );
  const { chi, zeta } = collectEvaluationChallenges(runtime, transcript, prove2Output.proof2);
  const proof3 = await timed("prove3", () =>
    Promise.resolve(
      prove3({
        runtime,
        state,
        rXY: prove1Output.rXY,
        chi,
        zeta,
      }),
    ),
  );
  const kappa1 = collectKappa1Challenge(transcript, proof3);
  const prove4Output = await timed("prove4", () =>
    prove4({
      runtime,
      crs: input.crs,
      state,
      rXY: prove1Output.rXY,
      prove0: prove0Output,
      prove2: prove2Output,
      proof3,
      thetas,
      kappa0,
      chi,
      zeta,
      kappa1,
    }),
  );

  return {
    proof4Debug: prove4Output.debug,
    proofArtifact: await timed("create verifier proof artifact", () =>
      createVerifierProofArtifactFromProverOutput({
        runtime,
        binding,
        prove0: prove0Output,
        prove1: prove1Output,
        prove2: prove2Output,
        proof3,
        prove4: prove4Output,
      }),
    ),
  };
}

async function compareGeneratedProofArtifact(
  runtime: CurveRuntime,
  generatedProof: Uint8Array,
  sourceDir: string,
): Promise<void> {
  const artifact = await loadRuntimeArtifactFile(generatedProof);
  if (artifact.kind !== BinaryArtifactFileKind.VerifierProof) {
    throw new Error(`Generated proof artifact kind mismatch: ${artifact.kind}.`);
  }

  const generated = loadVerifierProofArtifact(artifact).pointsByName;
  const native = await readNativeFormattedProof(runtime, path.join(sourceDir, "prove/proof.json"));

  for (const name of PROOF_POINT_NAMES) {
    if (!runtime.G1.eq(generated[name], native.points[name])) {
      throw new Error(
        [
          `Generated proof point mismatch at '${name}'.`,
          `native=${JSON.stringify(runtime.G1.formatAffine(native.points[name]))}`,
          `generated=${JSON.stringify(runtime.G1.formatAffine(generated[name]))}`,
        ].join(" "),
      );
    }
  }

  for (const name of PROOF_EVAL_NAMES) {
    if (!runtime.Fr.eq(generated[name], native.evals[name])) {
      throw new Error(
        `Generated proof scalar mismatch at '${name}': native=${runtime.Fr.toHex(native.evals[name])}, generated=${runtime.Fr.toHex(generated[name])}.`,
      );
    }
  }
}

async function compareProof4Debug(
  runtime: CurveRuntime,
  generated: Prove4DebugOutput,
  sourceDir: string,
): Promise<void> {
  const native = await readNativeProof4Test(runtime, path.join(sourceDir, "prove/proof4_test.json"));
  const generatedByName: Record<keyof Prove4DebugOutput, Uint8Array> = {
    Pi_AX: generated.Pi_AX,
    Pi_AY: generated.Pi_AY,
    Pi_CX: generated.Pi_CX,
    Pi_CY: generated.Pi_CY,
    Pi_B: generated.Pi_B,
    M_X: generated.M_X,
    M_Y: generated.M_Y,
    N_X: generated.N_X,
    N_Y: generated.N_Y,
  };

  for (const name of Object.keys(generatedByName) as (keyof Prove4DebugOutput)[]) {
    if (!runtime.G1.eq(generatedByName[name], native[name])) {
      throw new Error(
        [
          `Generated proof4 debug point mismatch at '${name}'.`,
          `native=${JSON.stringify(runtime.G1.formatAffine(native[name]))}`,
          `generated=${JSON.stringify(runtime.G1.formatAffine(generatedByName[name]))}`,
        ].join(" "),
      );
    }
  }
}

async function readNativeFormattedProof(
  runtime: CurveRuntime,
  filePath: string,
): Promise<{
  readonly points: Record<(typeof PROOF_POINT_NAMES)[number], Uint8Array>;
  readonly evals: Record<(typeof PROOF_EVAL_NAMES)[number], FieldElement>;
}> {
  const proof = await readJsonFile<{
    readonly proof_entries_part1: readonly string[];
    readonly proof_entries_part2: readonly string[];
  }>(filePath);
  if (proof.proof_entries_part1.length !== PROOF_POINT_NAMES.length * 2) {
    throw new Error("Native formatted proof part1 length does not match the expected G1 point count.");
  }
  if (proof.proof_entries_part2.length !== PROOF_POINT_NAMES.length * 2 + PROOF_EVAL_NAMES.length) {
    throw new Error("Native formatted proof part2 length does not match the expected G1/scalar count.");
  }

  const points = {} as Record<(typeof PROOF_POINT_NAMES)[number], Uint8Array>;
  for (let index = 0; index < PROOF_POINT_NAMES.length; index += 1) {
    points[PROOF_POINT_NAMES[index]] = runtime.G1.parseAffine({
      x: combineSplitHex(proof.proof_entries_part1[index * 2], proof.proof_entries_part2[index * 2]),
      y: combineSplitHex(proof.proof_entries_part1[index * 2 + 1], proof.proof_entries_part2[index * 2 + 1]),
    });
  }

  const evals = {} as Record<(typeof PROOF_EVAL_NAMES)[number], FieldElement>;
  const evalOffset = PROOF_POINT_NAMES.length * 2;
  for (let index = 0; index < PROOF_EVAL_NAMES.length; index += 1) {
    evals[PROOF_EVAL_NAMES[index]] = runtime.Fr.fromHex(proof.proof_entries_part2[evalOffset + index]);
  }

  return { points, evals };
}

async function readNativeProof4Test(
  runtime: CurveRuntime,
  filePath: string,
): Promise<Record<keyof Prove4DebugOutput, Uint8Array>> {
  const proof4 = await readJsonFile<Record<keyof Prove4DebugOutput, { readonly x: string; readonly y: string }>>(filePath);

  return {
    Pi_AX: runtime.G1.parseAffine(proof4.Pi_AX),
    Pi_AY: runtime.G1.parseAffine(proof4.Pi_AY),
    Pi_CX: runtime.G1.parseAffine(proof4.Pi_CX),
    Pi_CY: runtime.G1.parseAffine(proof4.Pi_CY),
    Pi_B: runtime.G1.parseAffine(proof4.Pi_B),
    M_X: runtime.G1.parseAffine(proof4.M_X),
    M_Y: runtime.G1.parseAffine(proof4.M_Y),
    N_X: runtime.G1.parseAffine(proof4.N_X),
    N_Y: runtime.G1.parseAffine(proof4.N_Y),
  };
}

function combineSplitHex(part1: string, part2: string): string {
  const left = stripHex(part1);
  const right = stripHex(part2);
  if (left.length !== 32 || right.length !== 64) {
    throw new Error("Native split G1 coordinate has an unexpected byte length.");
  }
  return `0x${left}${right}`;
}

function stripHex(value: string): string {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error(`Expected 0x-prefixed hex string, got: ${value}`);
  }
  return value.slice(2);
}

async function readPreparedRuntimeManifest(
  runtimeDir: string,
  artifactPath: string,
): Promise<RuntimeArtifactBundleManifest> {
  return parseRuntimeArtifactBundleManifest(await readPreparedRuntimeJson(runtimeDir, artifactPath));
}

async function readPreparedRuntimeJson<T>(runtimeDir: string, artifactPath: string): Promise<T> {
  const bytes = await readPreparedRuntimeFile(runtimeDir, artifactPath);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function readPreparedRuntimeFile(runtimeDir: string, artifactPath: string): Promise<Uint8Array> {
  const filePath = resolvePreparedRuntimePath(runtimeDir, artifactPath);

  try {
    return await readFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Required prepared runtime fixture file is missing: ${path.relative(process.cwd(), filePath)}.`,
        "Prepare owner package outputs, run npm run fixtures:copy, then run npm run fixtures:prepare.",
        `Original read error: ${message}`,
      ].join(" "),
    );
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(new TextDecoder().decode(await readFile(filePath))) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Required copied owner output is missing or invalid: ${path.relative(process.cwd(), filePath)}.`,
        "Run npm run fixtures:copy after preparing the owner package output.",
        `Original read error: ${message}`,
      ].join(" "),
    );
  }
}

function resolvePreparedRuntimePath(runtimeDir: string, artifactPath: string): string {
  if (path.isAbsolute(artifactPath) || artifactPath.includes("\\") || artifactPath.split("/").includes("..")) {
    throw new Error(`Prepared runtime artifact path must be a safe relative POSIX path: ${artifactPath}`);
  }

  const filePath = path.resolve(runtimeDir, artifactPath);
  const relative = path.relative(runtimeDir, filePath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Prepared runtime artifact path escapes fixtures/small/runtime: ${artifactPath}`);
  }

  return filePath;
}

async function timed<T>(label: string, callback: () => Promise<T>): Promise<T> {
  const start = performance.now();
  console.log(`Starting ${label}...`);
  const result = await callback();
  console.log(`Finished ${label} in ${formatDuration(performance.now() - start)}.`);
  return result;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(0)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function collectThetaChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof0: {
    readonly U: Uint8Array;
    readonly V: Uint8Array;
    readonly W: Uint8Array;
    readonly Q_AX: Uint8Array;
    readonly Q_AY: Uint8Array;
    readonly B: Uint8Array;
  },
): readonly [FieldElement, FieldElement, FieldElement] {
  transcript
    .commitG1Point(proof0.U, runtime.G1)
    .commitG1Point(proof0.V, runtime.G1)
    .commitG1Point(proof0.W, runtime.G1)
    .commitG1Point(proof0.Q_AX, runtime.G1)
    .commitG1Point(proof0.Q_AY, runtime.G1)
    .commitG1Point(proof0.B, runtime.G1);
  const thetas = transcript.getChallenges(3);

  return [thetas[0], thetas[1], thetas[2]];
}

function collectKappa0Challenge(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof1: { readonly R: Uint8Array },
): FieldElement {
  transcript.commitG1Point(proof1.R, runtime.G1);
  return transcript.squeezeChallenge();
}

function collectEvaluationChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof2: { readonly Q_CX: Uint8Array; readonly Q_CY: Uint8Array },
): { readonly chi: FieldElement; readonly zeta: FieldElement } {
  transcript.commitG1Point(proof2.Q_CX, runtime.G1).commitG1Point(proof2.Q_CY, runtime.G1);

  return {
    chi: transcript.squeezeChallenge(),
    zeta: transcript.squeezeChallenge(),
  };
}

function collectKappa1Challenge(
  transcript: RollingKeccakTranscript,
  proof3: {
    readonly V_eval: FieldElement;
    readonly R_eval: FieldElement;
    readonly R_omegaX_eval: FieldElement;
    readonly R_omegaX_omegaY_eval: FieldElement;
  },
): FieldElement {
  transcript
    .commitField(proof3.V_eval)
    .commitField(proof3.R_eval)
    .commitField(proof3.R_omegaX_eval)
    .commitField(proof3.R_omegaX_omegaY_eval);

  return transcript.squeezeChallenge();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
