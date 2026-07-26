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
import {
  encodeSigma1CommitmentBarrier,
  requireCommitment,
  type ProverCommitmentEncoder,
} from "../commitments/commitment-encoder.js";
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
  const field = runtime.Fr;
  const p0Product = await state.witnessBuffers.uXY.mul(
    state.witnessBuffers.vXY,
  );
  const p0XY = await p0Product.subBatch(state.witnessBuffers.wXY.resize(p0Product.xSize, p0Product.ySize));
  const { quotientX: q0XY, quotientY: q1XY } = await p0XY.divByVanishingOptBatch(
    state.setup.n,
    state.setup.s_max,
  );

  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const UXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.uXY],
    [state.mixer.rU_X, state.instanceBuffers.tN],
    [state.mixer.rU_Y, state.instanceBuffers.tSMax],
  ]);
  const VXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.instanceBuffers.tN],
    [state.mixer.rV_Y, state.instanceBuffers.tSMax],
  ]);
  const wZk = await linearCombinationBufferBatch(field, [
    [field.one, lowDegreeXTimesVanishingBuffer(field, state.mixer.rW_X, state.setup.n)],
    [field.one, lowDegreeYTimesVanishingBuffer(field, state.mixer.rW_Y, state.setup.s_max)],
  ]);
  const WXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.wXY],
    [field.one, wZk],
  ]);
  const Q_AX_XY = await linearCombinationBufferBatch(field, [
    [field.one, q0XY],
    [state.mixer.rU_X, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.witnessBuffers.uXY],
    [field.neg(field.one), rW_X],
    [field.mul(state.mixer.rU_X, state.mixer.rV_X), state.instanceBuffers.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_X), state.instanceBuffers.tSMax],
  ]);
  const Q_AY_XY = await linearCombinationBufferBatch(field, [
    [field.one, q1XY],
    [state.mixer.rU_Y, state.witnessBuffers.vXY],
    [state.mixer.rV_Y, state.witnessBuffers.uXY],
    [field.neg(field.one), rW_Y],
    [field.mul(state.mixer.rU_X, state.mixer.rV_Y), state.instanceBuffers.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_Y), state.instanceBuffers.tSMax],
  ]);
  const termBZk = await linearCombinationBufferBatch(field, [
    [field.one, lowDegreeXTimesVanishingBuffer(field, state.mixer.rB_X, state.setup.l_D - state.setup.l)],
    [field.one, lowDegreeYTimesVanishingBuffer(field, state.mixer.rB_Y, state.setup.s_max)],
  ]);
  const BXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.bXY],
    [field.one, termBZk],
  ]);

  const commitments = await encodeSigma1CommitmentBarrier(
    options.commitmentEncoder ?? createDefaultCommitmentEncoder(runtime, crs, state.setup),
    [
      { label: "U", polynomial: UXY },
      { label: "V", polynomial: VXY },
      { label: "W", polynomial: WXY },
      { label: "Q_AX", polynomial: Q_AX_XY },
      { label: "Q_AY", polynomial: Q_AY_XY },
      { label: "B", polynomial: BXY },
    ],
  );

  return {
    commitments: {
      U: requireCommitment(commitments, "U"),
      V: requireCommitment(commitments, "V"),
      W: requireCommitment(commitments, "W"),
      Q_AX: requireCommitment(commitments, "Q_AX"),
      Q_AY: requireCommitment(commitments, "Q_AY"),
      B: requireCommitment(commitments, "B"),
    },
    q0XY,
    q1XY,
    wZk,
    termBZk,
  };
}

function createDefaultCommitmentEncoder(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
): ProverCommitmentEncoder {
  return {
    parallelSafe: false,
    encodeSigma1PolynomialBuffer(job) {
      return encodePolynomialBufferWithSigma1(runtime, crs, setup, job.polynomial);
    },
  };
}
