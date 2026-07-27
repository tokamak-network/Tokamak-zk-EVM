import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import {
  type ProverCrsRuntime,
} from "../api/binary-input.js";
import type {
  ProverSetupParams,
} from "./witness.js";
import {
  linearCombinationBufferBatch,
} from "../polynomial/linear-combinations.js";
import {
  lowDegreeXTimesVanishingBuffer,
  lowDegreeYTimesVanishingBuffer,
} from "../polynomial/shifted-products.js";
import type { ProverCommitmentEncoder } from "../commitments/commitment-encoder.js";
import { encodePolynomialBufferWithSigma1 } from "../commitments/sigma1-encoder.js";
import type { ProverState } from "./state.js";

export interface InitialRelationCommitments {
  readonly U: Uint8Array;
  readonly V: Uint8Array;
  readonly W: Uint8Array;
  readonly Q_AX: Uint8Array;
  readonly Q_AY: Uint8Array;
  readonly B: Uint8Array;
}

export interface ArithmeticArgumentCommitments {
  readonly U: Uint8Array;
  readonly V: Uint8Array;
  readonly W: Uint8Array;
  readonly Q_AX: Uint8Array;
  readonly Q_AY: Uint8Array;
}

export interface ArithmeticArgumentComputation {
  readonly commitments: ArithmeticArgumentCommitments;
  readonly q0XY: BivariatePolynomialBuffer;
  readonly q1XY: BivariatePolynomialBuffer;
  readonly wZk: BivariatePolynomialBuffer;
}

export interface CopyWitnessComputation {
  readonly commitment: Uint8Array;
  readonly termBZk: BivariatePolynomialBuffer;
}

export interface InitialRelationComputation {
  readonly commitments: InitialRelationCommitments;
  readonly q0XY: BivariatePolynomialBuffer;
  readonly q1XY: BivariatePolynomialBuffer;
  readonly wZk: BivariatePolynomialBuffer;
  readonly termBZk: BivariatePolynomialBuffer;
}

export interface ProverOperationOptions {
  readonly commitmentEncoder?: ProverCommitmentEncoder;
}

export async function computeInitialRelationCommitments(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
  options: ProverOperationOptions = {},
): Promise<InitialRelationComputation> {
  const arithmetic = await computeArithmeticArgumentCommitments(runtime, crs, state, options);
  const copyWitness = await computeCopyWitnessCommitment(runtime, crs, state, options);

  return combineInitialRelation(arithmetic, copyWitness);
}

export async function computeArithmeticArgumentCommitments(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
  options: ProverOperationOptions = {},
): Promise<ArithmeticArgumentComputation> {
  const field = runtime.Fr;
  const p0Product = await state.witness.uXY.mul(
    state.witness.vXY,
  );
  const p0XY = await p0Product.subBatch(state.witness.wXY.resize(p0Product.xSize, p0Product.ySize));
  const { quotientX: q0XY, quotientY: q1XY } = await p0XY.divByVanishingOptBatch(
    state.setup.n,
    state.setup.s_max,
  );

  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const UXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witness.uXY],
    [state.mixer.rU_X, state.instance.tN],
    [state.mixer.rU_Y, state.instance.tSMax],
  ]);
  const VXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witness.vXY],
    [state.mixer.rV_X, state.instance.tN],
    [state.mixer.rV_Y, state.instance.tSMax],
  ]);
  const wZk = await linearCombinationBufferBatch(field, [
    [field.one, lowDegreeXTimesVanishingBuffer(field, state.mixer.rW_X, state.setup.n)],
    [field.one, lowDegreeYTimesVanishingBuffer(field, state.mixer.rW_Y, state.setup.s_max)],
  ]);
  const WXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witness.wXY],
    [field.one, wZk],
  ]);
  const Q_AX_XY = await linearCombinationBufferBatch(field, [
    [field.one, q0XY],
    [state.mixer.rU_X, state.witness.vXY],
    [state.mixer.rV_X, state.witness.uXY],
    [field.neg(field.one), rW_X],
    [field.mul(state.mixer.rU_X, state.mixer.rV_X), state.instance.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_X), state.instance.tSMax],
  ]);
  const Q_AY_XY = await linearCombinationBufferBatch(field, [
    [field.one, q1XY],
    [state.mixer.rU_Y, state.witness.vXY],
    [state.mixer.rV_Y, state.witness.uXY],
    [field.neg(field.one), rW_Y],
    [field.mul(state.mixer.rU_X, state.mixer.rV_Y), state.instance.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_Y), state.instance.tSMax],
  ]);
  const encode = options.commitmentEncoder ?? createDefaultCommitmentEncoder(runtime, crs, state.setup);
  const U = await encode(UXY);
  const V = await encode(VXY);
  const W = await encode(WXY);
  const Q_AX = await encode(Q_AX_XY);
  const Q_AY = await encode(Q_AY_XY);

  return {
    commitments: { U, V, W, Q_AX, Q_AY },
    q0XY,
    q1XY,
    wZk,
  };
}

export async function computeCopyWitnessCommitment(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
  options: ProverOperationOptions = {},
): Promise<CopyWitnessComputation> {
  const field = runtime.Fr;
  const termBZk = await linearCombinationBufferBatch(field, [
    [field.one, lowDegreeXTimesVanishingBuffer(field, state.mixer.rB_X, state.setup.l_D - state.setup.l)],
    [field.one, lowDegreeYTimesVanishingBuffer(field, state.mixer.rB_Y, state.setup.s_max)],
  ]);
  const BXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witness.bXY],
    [field.one, termBZk],
  ]);
  const encode = options.commitmentEncoder ?? createDefaultCommitmentEncoder(runtime, crs, state.setup);

  return {
    commitment: await encode(BXY),
    termBZk,
  };
}

export function combineInitialRelation(
  arithmetic: ArithmeticArgumentComputation,
  copyWitness: CopyWitnessComputation,
): InitialRelationComputation {
  return {
    commitments: {
      ...arithmetic.commitments,
      B: copyWitness.commitment,
    },
    q0XY: arithmetic.q0XY,
    q1XY: arithmetic.q1XY,
    wZk: arithmetic.wZk,
    termBZk: copyWitness.termBZk,
  };
}

function createDefaultCommitmentEncoder(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
): ProverCommitmentEncoder {
  return (polynomial) => encodePolynomialBufferWithSigma1(runtime, crs, setup, polynomial);
}
