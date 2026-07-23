import { BivariatePolynomialBuffer } from "../../core/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";
import type { ProverCrsRuntime } from "../api/binary-input.js";
import { encodePolynomialBufferWithSigma1, type ProverOperationOptions } from "./initial-relation.js";
import { encodeSigma1CommitmentBarrier, requireCommitment } from "./commitment-encoder.js";
import {
  buildLagrangeKl,
  constantPolynomialBuffer,
  linearCombinationBuffer,
  mulByLinearX,
  mulByLinearY,
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
  const rOmegaX = rXY.scaleCoeffsX(field.inv(omegaMI));
  const rOmegaXOmegaY = rOmegaX.scaleCoeffsY(field.inv(omegaSMax));
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = linearCombinationBuffer(field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], state.instanceBuffers.s0XY],
    [thetas[1], state.instanceBuffers.s1XY],
    [field.one, theta2],
  ]);
  const gXY = linearCombinationBuffer(field, [
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
  const p1XY = await multiplyByLagrangeKl(
    rXY.sub(constantPolynomialBuffer(field, field.one)),
    mI,
    sMax,
  );
  const p2Input = rGXY.sub(rOmegaXFXY);
  const p2XY = mulByXMinusOne(p2Input);
  const p3XY = await multiplyByLagrangeK0(rGXY.sub(rOmegaXOmegaYFXY), mI);
  const pCombined = linearCombinationBuffer(field, [
    [field.one, p1XY],
    [kappa0, p2XY],
    [kappa0Sq, p3XY],
  ]);
  const { quotientX: q2XY, quotientY: q3XY } = pCombined.divByVanishingOpt(mI, sMax);
  const rD1 = rXY.sub(rOmegaX);
  const rD2 = rXY.sub(rOmegaXOmegaY);
  const gD = gXY.sub(fXY);
  const qCxTerm2 = mulByXMinusOne(
    mulByLinearX(rD1, state.mixer.rB_X).add(gD.scale(state.mixer.rR_X)),
  );
  const qCxTerm3 = await multiplyByLagrangeK0(
    mulByLinearX(rD2, state.mixer.rB_X).add(gD.scale(state.mixer.rR_X)),
    mI,
  );
  const qCxXY = linearCombinationBuffer(field, [
    [field.one, q2XY],
    [state.mixer.rR_X, lagrangeKlXY],
    [kappa0, qCxTerm2],
    [kappa0Sq, qCxTerm3],
  ]);
  const qCyTerm2 = mulByXMinusOne(
    mulByLinearY(rD1, state.mixer.rB_Y).add(gD.scale(state.mixer.rR_Y)),
  );
  const qCyTerm3 = await multiplyByLagrangeK0(
    mulByLinearY(rD2, state.mixer.rB_Y).add(gD.scale(state.mixer.rR_Y)),
    mI,
  );
  const qCyXY = linearCombinationBuffer(field, [
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
