import type { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import type { G1Point, G2Point } from "../libs/runtime/group.js";
import type { RandomScalarSource } from "../libs/runtime/random.js";
import { collectChallenges } from "./challenges.js";
import { buildDomainContext, type VerifierSetupParams } from "./domain-context.js";
import {
  evalAPub,
  evalLagrangeK0,
  g1Add,
  lhsArith,
  lhsBinding,
  lhsCopy,
  snarkAux,
} from "./equations.js";
import { pairingProductsEqual } from "./pairings.js";

export interface VerifySnarkResult {
  readonly valid: boolean;
}

export interface VerifierInput {
  readonly setup: VerifierSetupParams;
  readonly sigma: SigmaVerifyRuntime;
  readonly preprocess: VerifierPreprocess;
  readonly proof: VerifierProof;
  readonly aPubX: DensePolynomialExt;
}

export interface SigmaVerifyRuntime {
  readonly G: G1Point;
  readonly H: G2Point;
  readonly sigma1: {
    readonly x: G1Point;
    readonly y: G1Point;
  };
  readonly sigma2: {
    readonly alpha: G2Point;
    readonly alpha2: G2Point;
    readonly alpha3: G2Point;
    readonly alpha4: G2Point;
    readonly gamma: G2Point;
    readonly delta: G2Point;
    readonly eta: G2Point;
    readonly x: G2Point;
    readonly y: G2Point;
  };
  readonly lagrangeKL: G1Point;
}

export interface VerifierPreprocess {
  readonly s0: G1Point;
  readonly s1: G1Point;
  readonly O_pub_fix: G1Point;
}

export interface VerifierProof {
  readonly binding: {
    readonly A_free: G1Point;
    readonly O_pub_free: G1Point;
    readonly O_mid: G1Point;
    readonly O_prv: G1Point;
  };
  readonly proof0: {
    readonly U: G1Point;
    readonly V: G1Point;
    readonly W: G1Point;
    readonly Q_AX: G1Point;
    readonly Q_AY: G1Point;
    readonly B: G1Point;
  };
  readonly proof1: {
    readonly R: G1Point;
  };
  readonly proof2: {
    readonly Q_CX: G1Point;
    readonly Q_CY: G1Point;
  };
  readonly proof3: {
    readonly V_eval: FieldElement;
    readonly R_eval: FieldElement;
    readonly R_omegaX_eval: FieldElement;
    readonly R_omegaX_omegaY_eval: FieldElement;
  };
  readonly proof4: {
    readonly Pi_X: G1Point;
    readonly Pi_Y: G1Point;
    readonly M_X: G1Point;
    readonly M_Y: G1Point;
    readonly N_X: G1Point;
    readonly N_Y: G1Point;
  };
}

export interface VerifySnarkOptions {
  readonly randomScalar?: RandomScalarSource;
}

export async function verifySnark(
  runtime: CurveRuntime,
  input: VerifierInput,
  options: VerifySnarkOptions = {},
): Promise<VerifySnarkResult> {
  const randomScalar = options.randomScalar ?? runtime.randomScalar;
  const challenges = await collectChallenges(runtime.Fr, runtime.G1, randomScalar, input.proof);
  const domain = buildDomainContext(runtime.Fr, input.setup, challenges);
  const lagrangeK0Eval = await evalLagrangeK0(runtime.Fr, domain, challenges);
  const aEval = evalAPub(input.aPubX, challenges);
  const lhsA = lhsArith(runtime.Fr, runtime.G1, input, domain, challenges);
  const lhsC = lhsCopy(runtime.Fr, runtime.G1, input, domain, challenges, lagrangeK0Eval);
  const lhsB = lhsBinding(runtime.Fr, runtime.G1, input.proof, input.sigma.G, challenges, aEval);
  const lhs = g1Add(runtime.G1, lhsB, runtime.G1.mulScalar(g1Add(runtime.G1, lhsA, lhsC), challenges.kappa2));
  const { aux, auxX, auxY } = snarkAux(runtime.Fr, runtime.G1, input.proof, domain, challenges);
  const proof0 = input.proof.proof0;
  const binding = input.proof.binding;

  const valid = await pairingProductsEqual(
    runtime.pairing,
    [
      { g1: g1Add(runtime.G1, lhs, aux), g2: input.sigma.H },
      { g1: proof0.B, g2: input.sigma.sigma2.alpha4 },
      { g1: proof0.U, g2: input.sigma.sigma2.alpha },
      { g1: proof0.V, g2: input.sigma.sigma2.alpha2 },
      { g1: proof0.W, g2: input.sigma.sigma2.alpha3 },
    ],
    [
      { g1: g1Add(runtime.G1, input.preprocess.O_pub_fix, binding.O_pub_free), g2: input.sigma.sigma2.gamma },
      { g1: binding.O_mid, g2: input.sigma.sigma2.eta },
      { g1: binding.O_prv, g2: input.sigma.sigma2.delta },
      { g1: auxX, g2: input.sigma.sigma2.x },
      { g1: auxY, g2: input.sigma.sigma2.y },
    ],
  );

  return { valid };
}
