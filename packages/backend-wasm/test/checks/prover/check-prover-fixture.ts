import path from "node:path";

import { BinaryArtifactFileKind } from "../../../src/artifacts/binary/binary-format.js";
import { loadRuntimeArtifactFile } from "../../../src/artifacts/runtime/loaders.js";
import { RollingKeccakTranscript } from "../../../src/runtime/crypto/transcript.js";
import {
  createCurveRuntime,
  type CurveRuntime,
} from "../../../src/runtime/curve/curve.js";
import type { FieldElement } from "../../../src/runtime/field/field-runtime.js";
import type { ProverRuntimeInput } from "../../../src/prover/api/binary-input.js";
import { createVerifierProofArtifactFromProverOutput } from "../../../src/prover/api/proof-output.js";
import { createProverState } from "../../../src/prover/protocol/state.js";
import { buildWitnessPolynomials } from "../../../src/prover/protocol/witness.js";
import { readProverRuntimeInput, readVerifierBinaryInput } from "../../support/runtime-inputs.js";
import { verifyBinaryForTest } from "../../support/verifier/verify-binary.js";
import { buildProverBinding } from "../../../src/prover/commitments/binding-commitments.js";
import { computeInitialRelationCommitments } from "../../../src/prover/protocol/initial-relation.js";
import { computeRecursionCommitment } from "../../../src/prover/protocol/recursion-commitment.js";
import { computeCopyQuotientCommitments } from "../../../src/prover/protocol/copy-quotient.js";
import { evaluateChallengePoints } from "../../../src/prover/protocol/challenge-evaluations.js";
import { computeOpeningCommitments } from "../../../src/prover/protocol/opening-commitments.js";

async function main(): Promise<void> {
  const runtimeDir = path.resolve("fixtures/small/runtime");
  const runtime = await createCurveRuntime();

  try {
    const proverInput = await timed("load prover runtime input", () =>
      readProverRuntimeInput(runtime, runtimeDir),
    );
    const generatedProof = await provePreparedInputWithTimings(runtime, proverInput);

    await timed("load generated proof artifact", () => loadRuntimeArtifactFile(generatedProof)).then((artifact) => {
      if (artifact.kind !== BinaryArtifactFileKind.VerifierProof) {
        throw new Error(`Prover output artifact kind mismatch: ${artifact.kind}.`);
      }
    });

    const verifierInput = await readVerifierBinaryInput(runtimeDir, generatedProof);
    const verificationResult = await timed("verify generated proof", () =>
      verifyBinaryForTest(
        runtime,
        verifierInput,
        {
          randomScalar: () => runtime.Fr.one,
        },
      ),
    );

    if (!verificationResult) {
      throw new Error("Verifier rejected the proof produced from prepared prover runtime fixtures.");
    }
  } finally {
    await runtime.terminate();
  }

  console.log("Checked prover binary output against the prepared verifier runtime path");
}

async function provePreparedInputWithTimings(runtime: CurveRuntime, input: ProverRuntimeInput): Promise<Uint8Array> {
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
      state.instanceBuffers.aFreeX,
      state.mixer,
    ),
  );
  const transcript = new RollingKeccakTranscript(runtime.Fr);
  const prove0Output = await timed("prove0", () => computeInitialRelationCommitments(runtime, input.crs, state));
  const thetas = collectThetaChallenges(runtime, transcript, prove0Output.commitments);
  const prove1Output = await timed("prove1", () => computeRecursionCommitment(runtime, input.crs, state, thetas));
  const kappa0 = collectKappa0Challenge(runtime, transcript, prove1Output.commitment);
  const prove2Output = await timed("prove2", () =>
    computeCopyQuotientCommitments({
      runtime,
      crs: input.crs,
      state,
      rXY: prove1Output.rXY,
      thetas,
      kappa0,
    }),
  );
  const { chi, zeta } = collectEvaluationChallenges(runtime, transcript, prove2Output.commitments);
  const evaluations = await timed("prove3", () =>
    evaluateChallengePoints({
      runtime,
      state,
      rXY: prove1Output.rXY,
      chi,
      zeta,
    }),
  );
  const kappa1 = collectKappa1Challenge(transcript, evaluations);
  const prove4Output = await timed("prove4", () =>
    computeOpeningCommitments({
      runtime,
      crs: input.crs,
      state,
      rXY: prove1Output.rXY,
      initialRelation: prove0Output,
      copyQuotient: prove2Output,
      evaluations,
      thetas,
      kappa0,
      chi,
      zeta,
      kappa1,
    }),
  );

  return timed("create verifier proof artifact", () =>
    createVerifierProofArtifactFromProverOutput({
      runtime,
      binding,
      initialRelation: prove0Output,
      recursion: prove1Output,
      copyQuotient: prove2Output,
      evaluations,
      openings: prove4Output,
    }),
  );
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
  evaluations: {
    readonly V_eval: FieldElement;
    readonly R_eval: FieldElement;
    readonly R_omegaX_eval: FieldElement;
    readonly R_omegaX_omegaY_eval: FieldElement;
  },
): FieldElement {
  transcript
    .commitField(evaluations.V_eval)
    .commitField(evaluations.R_eval)
    .commitField(evaluations.R_omegaX_eval)
    .commitField(evaluations.R_omegaX_omegaY_eval);

  return transcript.squeezeChallenge();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
