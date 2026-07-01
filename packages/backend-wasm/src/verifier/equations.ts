import { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { FieldElement, FieldRuntime } from "../libs/runtime/field.js";
import type { G1Point, G1Runtime } from "../libs/runtime/group.js";
import type { VerifierChallenges } from "./challenges.js";
import type { VerifierDomainContext } from "./domain-context.js";
import type { VerifierInput, VerifierProof } from "./verify-snark.js";

export async function evalLagrangeK0(
  field: FieldRuntime,
  domain: VerifierDomainContext,
  challenges: VerifierChallenges,
): Promise<FieldElement> {
  const evaluations = Array.from({ length: domain.mI }, () => field.zero);
  evaluations[0] = field.one;
  const polynomial = await DensePolynomialExt.fromRouEvals(field, evaluations, domain.mI, 1);
  return polynomial.eval(challenges.chi, challenges.zeta);
}

export function evalAPub(aPubX: DensePolynomialExt, challenges: VerifierChallenges): FieldElement {
  return aPubX.eval(challenges.chi, challenges.zeta);
}

export function lhsArith(
  field: FieldRuntime,
  g1: G1Runtime,
  input: VerifierInput,
  domain: VerifierDomainContext,
  challenges: VerifierChallenges,
): G1Point {
  const proof0 = input.proof.proof0;
  const proof3 = input.proof.proof3;

  return g1Sub(
    g1,
    g1Sub(
      g1,
      g1Sub(
        g1,
        g1Add(
          g1,
          g1Sub(g1, g1Mul(g1, proof0.U, proof3.V_eval), proof0.W),
          g1Mul(
            g1,
            g1Sub(g1, proof0.V, g1Mul(g1, input.sigma.G, proof3.V_eval)),
            challenges.kappa1,
          ),
        ),
        g1Mul(g1, proof0.Q_AX, domain.tNEval),
      ),
      g1Mul(g1, proof0.Q_AY, domain.tSMaxEval),
    ),
    g1.zero,
  );
}

export function lhsCopy(
  field: FieldRuntime,
  g1: G1Runtime,
  input: VerifierInput,
  domain: VerifierDomainContext,
  challenges: VerifierChallenges,
  lagrangeK0Eval: FieldElement,
): G1Point {
  const proof0 = input.proof.proof0;
  const proof1 = input.proof.proof1;
  const proof2 = input.proof.proof2;
  const proof3 = input.proof.proof3;
  const kappa0Squared = field.square(challenges.kappa0);
  const kappa1Squared = field.square(challenges.kappa1);
  const kappa1Cubed = field.mul(kappa1Squared, challenges.kappa1);
  const kappa2Squared = field.square(challenges.kappa2);

  const F = g1AddMany(g1, [
    proof0.B,
    g1Mul(g1, input.preprocess.s0, challenges.thetas[0]),
    g1Mul(g1, input.preprocess.s1, challenges.thetas[1]),
    g1Mul(g1, input.sigma.G, challenges.thetas[2]),
  ]);
  const G = g1AddMany(g1, [
    proof0.B,
    g1Mul(g1, input.sigma.sigma1.x, challenges.thetas[0]),
    g1Mul(g1, input.sigma.sigma1.y, challenges.thetas[1]),
    g1Mul(g1, input.sigma.G, challenges.thetas[2]),
  ]);
  const gTimesREval = g1Mul(g1, G, proof3.R_eval);

  const lhsCTerm1 = g1AddMany(g1, [
    g1Mul(g1, input.sigma.lagrangeKL, field.sub(proof3.R_eval, field.one)),
    g1Mul(
      g1,
      g1Sub(g1, gTimesREval, g1Mul(g1, F, proof3.R_omegaX_eval)),
      field.mul(challenges.kappa0, field.sub(challenges.chi, field.one)),
    ),
    g1Mul(
      g1,
      g1Sub(g1, gTimesREval, g1Mul(g1, F, proof3.R_omegaX_omegaY_eval)),
      field.mul(kappa0Squared, lagrangeK0Eval),
    ),
    g1Neg(g1, g1Mul(g1, proof2.Q_CX, domain.tMIEval)),
    g1Neg(g1, g1Mul(g1, proof2.Q_CY, domain.tSMaxEval)),
  ]);

  return g1AddMany(g1, [
    g1Mul(g1, lhsCTerm1, kappa1Squared),
    g1Mul(g1, g1Sub(g1, proof1.R, g1Mul(g1, input.sigma.G, proof3.R_eval)), kappa1Cubed),
    g1Mul(g1, g1Sub(g1, proof1.R, g1Mul(g1, input.sigma.G, proof3.R_omegaX_eval)), challenges.kappa2),
    g1Mul(
      g1,
      g1Sub(g1, proof1.R, g1Mul(g1, input.sigma.G, proof3.R_omegaX_omegaY_eval)),
      kappa2Squared,
    ),
  ]);
}

export function lhsBinding(
  field: FieldRuntime,
  g1: G1Runtime,
  proof: VerifierProof,
  sigmaG: G1Point,
  challenges: VerifierChallenges,
  aEval: FieldElement,
): G1Point {
  const kappa1Fourth = field.square(field.square(challenges.kappa1));
  const bindingScalar = field.mul(challenges.kappa2, kappa1Fourth);
  return g1Sub(
    g1,
    g1Mul(g1, proof.binding.A_free, field.add(field.one, bindingScalar)),
    g1Mul(g1, sigmaG, field.mul(bindingScalar, aEval)),
  );
}

export interface SnarkAuxResult {
  readonly aux: G1Point;
  readonly auxX: G1Point;
  readonly auxY: G1Point;
}

export function snarkAux(
  field: FieldRuntime,
  g1: G1Runtime,
  proof: VerifierProof,
  domain: VerifierDomainContext,
  challenges: VerifierChallenges,
): SnarkAuxResult {
  const proof4 = proof.proof4;
  const kappa2Squared = field.square(challenges.kappa2);
  const kappa2Cubed = field.mul(kappa2Squared, challenges.kappa2);
  const omegaMIInv = field.inv(domain.omegaMI);
  const omegaSMaxInv = field.inv(domain.omegaSMax);

  const aux = g1AddMany(g1, [
    g1Mul(g1, proof4.Pi_X, field.mul(challenges.kappa2, challenges.chi)),
    g1Mul(g1, proof4.Pi_Y, field.mul(challenges.kappa2, challenges.zeta)),
    g1Mul(g1, proof4.M_X, field.mul(field.mul(kappa2Squared, omegaMIInv), challenges.chi)),
    g1Mul(g1, proof4.M_Y, field.mul(kappa2Squared, challenges.zeta)),
    g1Mul(g1, proof4.N_X, field.mul(field.mul(kappa2Cubed, omegaMIInv), challenges.chi)),
    g1Mul(g1, proof4.N_Y, field.mul(field.mul(kappa2Cubed, omegaSMaxInv), challenges.zeta)),
  ]);
  const auxX = g1AddMany(g1, [
    g1Mul(g1, proof4.Pi_X, challenges.kappa2),
    g1Mul(g1, proof4.M_X, kappa2Squared),
    g1Mul(g1, proof4.N_X, kappa2Cubed),
  ]);
  const auxY = g1AddMany(g1, [
    g1Mul(g1, proof4.Pi_Y, challenges.kappa2),
    g1Mul(g1, proof4.M_Y, kappa2Squared),
    g1Mul(g1, proof4.N_Y, kappa2Cubed),
  ]);

  return { aux, auxX, auxY };
}

export function g1Add(g1: G1Runtime, left: G1Point, right: G1Point): G1Point {
  return g1.add(left, right);
}

export function g1Sub(g1: G1Runtime, left: G1Point, right: G1Point): G1Point {
  return g1.sub(left, right);
}

export function g1Neg(g1: G1Runtime, value: G1Point): G1Point {
  return g1.neg(value);
}

export function g1Mul(g1: G1Runtime, point: G1Point, scalar: FieldElement): G1Point {
  return g1.mulScalar(point, scalar);
}

export function g1AddMany(g1: G1Runtime, points: readonly G1Point[]): G1Point {
  return points.reduce((accumulator, point) => g1.add(accumulator, point), g1.zero);
}
