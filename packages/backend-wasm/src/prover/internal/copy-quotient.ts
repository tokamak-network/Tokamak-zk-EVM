import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field.js";
import type { ProverCrsRuntime } from "../api/binary-input.js";
import { encodePolynomialBufferWithSigma1, type ProverOperationOptions } from "./initial-relation.js";
import { encodeSigma1CommitmentBarrier, requireCommitment } from "./commitment-encoder.js";
import {
  buildLagrangeKl,
  combineLinearXWithScaled,
  combineLinearYWithScaled,
  constantPolynomialBuffer,
  linearCombinationBufferBatch,
  mulByXMinusOne,
  multiplyByLagrangeK0,
  multiplyByLagrangeKl,
  multiplyOmegaShiftedProducts,
} from "./polynomial-ops.js";
import type { ProverState } from "./state.js";

export interface CopyQuotientCommitments {
  readonly Q_CX: Uint8Array;
  readonly Q_CY: Uint8Array;
}

export interface CopyQuotientComputation {
  readonly commitments: CopyQuotientCommitments;
  readonly q2XY: BivariatePolynomialBuffer;
  readonly q3XY: BivariatePolynomialBuffer;
  readonly lagrangeKlXY: BivariatePolynomialBuffer;
}

export async function computeCopyQuotientCommitments(input: {
  readonly runtime: CurveRuntime;
  readonly crs: ProverCrsRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly thetas: readonly FieldElement[];
  readonly kappa0: FieldElement;
  readonly options?: ProverOperationOptions;
}): Promise<CopyQuotientComputation> {
  const { runtime, crs, state, rXY, thetas, kappa0, options = {} } = input;
  if (thetas.length < 3) {
    throw new Error("computeCopyQuotientCommitments requires at least three theta challenges.");
  }

  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const kappa0Sq = field.square(kappa0);
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(sMax);
  const rOmegaX = await rXY.scaleCoeffsXBatch(field.inv(omegaMI));
  const rOmegaXOmegaY = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    await field.batchApplyKeyBuffer(rOmegaX.coefficients, field.one, field.inv(omegaSMax)),
    rOmegaX.xSize,
    rOmegaX.ySize,
  );
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], state.instanceBuffers.s0XY],
    [thetas[1], state.instanceBuffers.s1XY],
    [field.one, theta2],
  ]);
  const gXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
    [field.one, theta2],
  ]);
  const lagrangeKlXY = await buildLagrangeKl(field, mI, sMax);
  const [rGXY, rOmegaXFXY, rOmegaXOmegaYFXY] = await multiplyOmegaShiftedProducts(
    rXY,
    gXY,
    fXY,
    mI,
    sMax,
  );
  const p1Input = await linearCombinationBufferBatch(field, [
    [field.one, rXY],
    [field.neg(field.one), constantPolynomialBuffer(field, field.one)],
  ]);
  const p1XY = await multiplyByLagrangeKl(p1Input, mI, sMax);
  const p2Input = await rGXY.subBatch(rOmegaXFXY);
  const p2XY = await mulByXMinusOne(p2Input);
  const p3XY = await multiplyByLagrangeK0(await rGXY.subBatch(rOmegaXOmegaYFXY), mI);
  const pCombined = await linearCombinationBufferBatch(field, [
    [field.one, p1XY],
    [kappa0, p2XY],
    [kappa0Sq, p3XY],
  ]);
  const { quotientX: q2XY, quotientY: q3XY } = await pCombined.divByVanishingOptBatch(mI, sMax);
  const rD1 = await rXY.subBatch(rOmegaX);
  const rD2 = await rXY.subBatch(rOmegaXOmegaY);
  const gD = await gXY.subBatch(fXY);
  const qCxTerm2 = await mulByXMinusOne(
    await combineLinearXWithScaled(rD1, state.mixer.rB_X, gD, state.mixer.rR_X),
  );
  const qCxTerm3 = await multiplyByLagrangeK0(
    await combineLinearXWithScaled(rD2, state.mixer.rB_X, gD, state.mixer.rR_X),
    mI,
  );
  const qCxXY = await linearCombinationBufferBatch(field, [
    [field.one, q2XY],
    [state.mixer.rR_X, lagrangeKlXY],
    [kappa0, qCxTerm2],
    [kappa0Sq, qCxTerm3],
  ]);
  const qCyTerm2 = await mulByXMinusOne(
    await combineLinearYWithScaled(rD1, state.mixer.rB_Y, gD, state.mixer.rR_Y),
  );
  const qCyTerm3 = await multiplyByLagrangeK0(
    await combineLinearYWithScaled(rD2, state.mixer.rB_Y, gD, state.mixer.rR_Y),
    mI,
  );
  const qCyXY = await linearCombinationBufferBatch(field, [
    [field.one, q3XY],
    [state.mixer.rR_Y, lagrangeKlXY],
    [kappa0, qCyTerm2],
    [kappa0Sq, qCyTerm3],
  ]);

  const commitments = await encodeSigma1CommitmentBarrier(
    options.commitmentEncoder ?? {
      parallelSafe: false,
      encodeSigma1PolynomialBuffer(job) {
        return encodePolynomialBufferWithSigma1(runtime, crs, state.setup, job.polynomial);
      },
    },
    [
      { label: "Q_CX", polynomial: qCxXY },
      { label: "Q_CY", polynomial: qCyXY },
    ],
  );

  return {
    commitments: {
      Q_CX: requireCommitment(commitments, "Q_CX"),
      Q_CY: requireCommitment(commitments, "Q_CY"),
    },
    q2XY,
    q3XY,
    lagrangeKlXY,
  };
}
