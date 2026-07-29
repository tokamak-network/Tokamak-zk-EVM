import { RollingKeccakTranscript } from "../../runtime/crypto/transcript.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";
import type { ProverRuntimeInput } from "../api/binary-input.js";
import type { ProverVerifierProofOutputInput } from "../api/proof-output.js";
import type { ProverBinding } from "../commitments/binding-commitments.js";
import type { ProverCommitmentEncoder } from "../commitments/commitment-encoder.js";
import { createSigma1CommitmentEncoder } from "../commitments/sigma1-encoder.js";
import { createProverState, type ProverState } from "./state.js";
import { buildWitnessPolynomials } from "./witness.js";
import { buildProverBinding } from "../commitments/binding-commitments.js";
import {
  combineInitialRelation,
  computeArithmeticArgumentCommitments,
  computeCopyWitnessCommitment,
  type ArithmeticArgumentComputation,
  type InitialRelationComputation,
} from "./initial-relation.js";
import { computeRecursionCommitment, type RecursionComputation } from "./recursion-commitment.js";
import {
  computeCopyQuotientCommitments,
  type CopyQuotientComputation,
} from "./copy-quotient.js";
import { evaluateChallengePoints, type ChallengeEvaluations } from "./challenge-evaluations.js";
import {
  combineOpeningCommitments,
  computeCopyOpeningCommitments,
  computeIntegratedOpeningCommitments,
  type CopyOpeningComputation,
} from "./opening-commitments.js";

export interface IntegratedProverOptions {
  readonly denseSigma1MsmChunkPoints?: number;
}

export interface ProverProtocolSession {
  proveArithmetic(): Promise<void>;
  proveCopy(): Promise<void>;
  proveBinding(): Promise<void>;
  finalize(): Promise<ProverVerifierProofOutputInput>;
  dispose(): void;
}

type ProverProtocolStage =
  | "ready"
  | "running"
  | "arithmetic"
  | "copy"
  | "binding"
  | "finalized"
  | "disposed";

export function createProverProtocolSession(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  options: IntegratedProverOptions = {},
): ProverProtocolSession {
  return new StatefulProverProtocolSession(runtime, input, options);
}

class StatefulProverProtocolSession implements ProverProtocolSession {
  private readonly runtime: CurveRuntime;
  private input: ProverRuntimeInput | undefined;
  private commitmentEncoder: ProverCommitmentEncoder | undefined;
  private transcript: RollingKeccakTranscript | undefined;
  private stage: ProverProtocolStage = "ready";
  private state: ProverState | undefined;
  private arithmetic: ArithmeticArgumentComputation | undefined;
  private initialRelation: InitialRelationComputation | undefined;
  private recursion: RecursionComputation | undefined;
  private copyQuotient: CopyQuotientComputation | undefined;
  private evaluations: ChallengeEvaluations | undefined;
  private copyOpenings: CopyOpeningComputation | undefined;
  private binding: ProverBinding | undefined;
  private thetas: readonly [FieldElement, FieldElement, FieldElement] | undefined;
  private kappa0: FieldElement | undefined;
  private chi: FieldElement | undefined;
  private zeta: FieldElement | undefined;
  private kappa1: FieldElement | undefined;

  constructor(runtime: CurveRuntime, input: ProverRuntimeInput, options: IntegratedProverOptions) {
    this.runtime = runtime;
    this.input = input;
    this.commitmentEncoder = createSigma1CommitmentEncoder(
      runtime,
      input.crs,
      input.witness.setup,
      options.denseSigma1MsmChunkPoints,
    );
    this.transcript = new RollingKeccakTranscript(runtime.Fr);
  }

  async proveArithmetic(): Promise<void> {
    this.assertStage("ready", "proveArithmetic");
    this.stage = "running";
    const input = this.requireInput();
    const witness = await buildWitnessPolynomials(this.runtime.Fr, input.witness);
    const state = await createProverState({
      runtime: this.runtime,
      setup: input.witness.setup,
      publicInstance: input.publicInstance,
      permutation: input.permutation,
      witness,
    });
    const arithmetic = await computeArithmeticArgumentCommitments(
      this.runtime,
      state,
      this.requireCommitmentEncoder(),
    );

    this.state = state;
    this.arithmetic = arithmetic;
    this.stage = "arithmetic";
  }

  async proveCopy(): Promise<void> {
    this.assertStage("arithmetic", "proveCopy");
    this.stage = "running";
    const state = requireValue(this.state, "prover state");
    const arithmetic = requireValue(this.arithmetic, "arithmetic argument");
    const transcript = requireValue(this.transcript, "prover transcript");
    const copyWitness = await computeCopyWitnessCommitment(
      this.runtime,
      state,
      this.requireCommitmentEncoder(),
    );
    const initialRelation = combineInitialRelation(arithmetic, copyWitness);
    const thetas = collectThetaChallenges(this.runtime, transcript, initialRelation.commitments);
    const recursion = await computeRecursionCommitment(
      this.runtime,
      state,
      thetas,
      this.requireCommitmentEncoder(),
    );
    const kappa0 = collectKappa0Challenge(this.runtime, transcript, recursion.commitment);
    const copyQuotient = await computeCopyQuotientCommitments({
      runtime: this.runtime,
      state,
      rXY: recursion.rXY,
      thetas,
      kappa0,
      commitmentEncoder: this.requireCommitmentEncoder(),
    });
    const { chi, zeta } = collectEvaluationChallenges(this.runtime, transcript, copyQuotient.commitments);
    const evaluations = await evaluateChallengePoints({
      runtime: this.runtime,
      state,
      rXY: recursion.rXY,
      chi,
      zeta,
    });
    const kappa1 = collectKappa1Challenge(transcript, evaluations);
    const copyOpenings = await computeCopyOpeningCommitments({
      runtime: this.runtime,
      state,
      rXY: recursion.rXY,
      chi,
      zeta,
      commitmentEncoder: this.requireCommitmentEncoder(),
    });

    this.initialRelation = initialRelation;
    this.recursion = recursion;
    this.copyQuotient = copyQuotient;
    this.evaluations = evaluations;
    this.copyOpenings = copyOpenings;
    this.thetas = thetas;
    this.kappa0 = kappa0;
    this.chi = chi;
    this.zeta = zeta;
    this.kappa1 = kappa1;
    this.stage = "copy";
  }

  async proveBinding(): Promise<void> {
    this.assertStage("copy", "proveBinding");
    this.stage = "running";
    const input = this.requireInput();
    const state = requireValue(this.state, "prover state");
    this.binding = await buildProverBinding(
      this.runtime,
      input.crs,
      input.witness.setup,
      input.witness.placementVariables,
      input.witness.subcircuitInfos,
      state.instance.aFreeX,
      state.mixer,
      requireValue(this.commitmentEncoder, "commitment encoder"),
    );
    this.stage = "binding";
  }

  async finalize(): Promise<ProverVerifierProofOutputInput> {
    this.assertStage("binding", "finalize");
    this.stage = "running";
    const state = requireValue(this.state, "prover state");
    const initialRelation = requireValue(this.initialRelation, "initial relation");
    const recursion = requireValue(this.recursion, "recursion argument");
    const copyQuotient = requireValue(this.copyQuotient, "copy quotient");
    const evaluations = requireValue(this.evaluations, "challenge evaluations");
    const copyOpenings = requireValue(this.copyOpenings, "copy openings");
    const integratedOpenings = await computeIntegratedOpeningCommitments({
      runtime: this.runtime,
      state,
      rXY: recursion.rXY,
      initialRelation,
      copyQuotient,
      thetas: requireValue(this.thetas, "theta challenges"),
      kappa0: requireValue(this.kappa0, "kappa0 challenge"),
      chi: requireValue(this.chi, "chi challenge"),
      zeta: requireValue(this.zeta, "zeta challenge"),
      kappa1: requireValue(this.kappa1, "kappa1 challenge"),
      copyOpenings,
      commitmentEncoder: this.requireCommitmentEncoder(),
    });
    this.stage = "finalized";

    return {
      runtime: this.runtime,
      binding: requireValue(this.binding, "binding argument"),
      initialRelation,
      recursion,
      copyQuotient,
      evaluations,
      openings: combineOpeningCommitments(copyOpenings, integratedOpenings),
    };
  }

  dispose(): void {
    this.stage = "disposed";
    this.input = undefined;
    this.commitmentEncoder = undefined;
    this.transcript = undefined;
    this.state = undefined;
    this.arithmetic = undefined;
    this.initialRelation = undefined;
    this.recursion = undefined;
    this.copyQuotient = undefined;
    this.evaluations = undefined;
    this.copyOpenings = undefined;
    this.binding = undefined;
    this.thetas = undefined;
    this.kappa0 = undefined;
    this.chi = undefined;
    this.zeta = undefined;
    this.kappa1 = undefined;
  }

  private requireCommitmentEncoder(): ProverCommitmentEncoder {
    return requireValue(this.commitmentEncoder, "commitment encoder");
  }

  private requireInput(): ProverRuntimeInput {
    return requireValue(this.input, "prover input");
  }

  private assertStage(expected: ProverProtocolStage, operation: string): void {
    if (this.stage !== expected) {
      throw new Error(
        `${operation} requires prover stage '${expected}', but the current stage is '${this.stage}'.`,
      );
    }
  }
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing ${label} in prover session.`);
  }
  return value;
}

function collectThetaChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  commitments: {
    readonly U: Uint8Array;
    readonly V: Uint8Array;
    readonly W: Uint8Array;
    readonly Q_AX: Uint8Array;
    readonly Q_AY: Uint8Array;
    readonly B: Uint8Array;
  },
): readonly [FieldElement, FieldElement, FieldElement] {
  transcript
    .commitG1Point(commitments.U, runtime.G1)
    .commitG1Point(commitments.V, runtime.G1)
    .commitG1Point(commitments.W, runtime.G1)
    .commitG1Point(commitments.Q_AX, runtime.G1)
    .commitG1Point(commitments.Q_AY, runtime.G1)
    .commitG1Point(commitments.B, runtime.G1);
  const thetas = transcript.getChallenges(3);

  return [thetas[0], thetas[1], thetas[2]];
}

function collectKappa0Challenge(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  commitment: { readonly R: Uint8Array },
): FieldElement {
  transcript.commitG1Point(commitment.R, runtime.G1);
  return transcript.squeezeChallenge();
}

function collectEvaluationChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  commitments: { readonly Q_CX: Uint8Array; readonly Q_CY: Uint8Array },
): { readonly chi: FieldElement; readonly zeta: FieldElement } {
  transcript.commitG1Point(commitments.Q_CX, runtime.G1).commitG1Point(commitments.Q_CY, runtime.G1);

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
