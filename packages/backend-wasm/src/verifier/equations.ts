import type { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { FieldElement, FieldRuntime } from "../libs/runtime/field.js";
import type { G1Point, G1Runtime } from "../libs/runtime/group.js";
import type { VerifierChallenges } from "./challenges.js";
import type { VerifierDomainContext } from "./domain-context.js";
import type { VerifierInput, VerifierProof } from "./verify-snark.js";

export function evalLagrangeK0(
  field: FieldRuntime,
  domain: VerifierDomainContext,
  challenges: VerifierChallenges,
): FieldElement {
  if (field.eq(challenges.chi, field.one)) {
    return field.one;
  }

  const denominator = field.mul(field.fromBigInt(BigInt(domain.mI)), field.sub(challenges.chi, field.one));
  return field.div(domain.tMIEval, denominator);
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

  return g1.sub(
    g1.sub(
      g1.sub(
        g1.add(
          g1.sub(g1.mulAffineScalar(proof0.U, proof3.V_eval), proof0.W),
          g1.mulScalar(
            g1.sub(proof0.V, g1.mulAffineScalar(input.sigma.G, proof3.V_eval)),
            challenges.kappa1,
          ),
        ),
        g1.mulAffineScalar(proof0.Q_AX, domain.tNEval),
      ),
      g1.mulAffineScalar(proof0.Q_AY, domain.tSMaxEval),
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
    g1.mulScalar(input.preprocess.s0, challenges.thetas[0]),
    g1.mulScalar(input.preprocess.s1, challenges.thetas[1]),
    g1.mulScalar(input.sigma.G, challenges.thetas[2]),
  ]);
  const G = g1AddMany(g1, [
    proof0.B,
    g1.mulScalar(input.sigma.sigma1.x, challenges.thetas[0]),
    g1.mulScalar(input.sigma.sigma1.y, challenges.thetas[1]),
    g1.mulScalar(input.sigma.G, challenges.thetas[2]),
  ]);
  const gTimesREval = g1.mulScalar(G, proof3.R_eval);

  const lhsCTerm1 = g1AddMany(g1, [
    g1.mulScalar(input.sigma.lagrangeKL, field.sub(proof3.R_eval, field.one)),
    g1.mulScalar(
      g1.sub(gTimesREval, g1.mulScalar(F, proof3.R_omegaX_eval)),
      field.mul(challenges.kappa0, field.sub(challenges.chi, field.one)),
    ),
    g1.mulScalar(
      g1.sub(gTimesREval, g1.mulScalar(F, proof3.R_omegaX_omegaY_eval)),
      field.mul(kappa0Squared, lagrangeK0Eval),
    ),
    g1.neg(g1.mulScalar(proof2.Q_CX, domain.tMIEval)),
    g1.neg(g1.mulScalar(proof2.Q_CY, domain.tSMaxEval)),
  ]);

  return g1AddMany(g1, [
    g1.mulScalar(lhsCTerm1, kappa1Squared),
    g1.mulScalar(g1.sub(proof1.R, g1.mulScalar(input.sigma.G, proof3.R_eval)), kappa1Cubed),
    g1.mulScalar(g1.sub(proof1.R, g1.mulScalar(input.sigma.G, proof3.R_omegaX_eval)), challenges.kappa2),
    g1.mulScalar(
      g1.sub(proof1.R, g1.mulScalar(input.sigma.G, proof3.R_omegaX_omegaY_eval)),
      kappa2Squared,
    ),
  ]);
}

export async function lhsCopyMsm(
  field: FieldRuntime,
  g1: G1Runtime,
  input: VerifierInput,
  domain: VerifierDomainContext,
  challenges: VerifierChallenges,
  lagrangeK0Eval: FieldElement,
): Promise<G1Point> {
  const proof1 = input.proof.proof1;
  const proof2 = input.proof.proof2;
  const proof3 = input.proof.proof3;
  const theta0 = challenges.thetas[0];
  const theta1 = challenges.thetas[1];
  const theta2 = challenges.thetas[2];
  const kappa0Squared = field.square(challenges.kappa0);
  const kappa1Squared = field.square(challenges.kappa1);
  const kappa1Cubed = field.mul(kappa1Squared, challenges.kappa1);
  const kappa2Squared = field.square(challenges.kappa2);
  const chiMinusOne = field.sub(challenges.chi, field.one);
  const firstCopyScalar = field.mul(challenges.kappa0, chiMinusOne);
  const secondCopyScalar = field.mul(kappa0Squared, lagrangeK0Eval);
  const gCombinedCoeff = field.mul(proof3.R_eval, field.add(firstCopyScalar, secondCopyScalar));
  const fCombinedCoeff = field.neg(
    field.add(
      field.mul(firstCopyScalar, proof3.R_omegaX_eval),
      field.mul(secondCopyScalar, proof3.R_omegaX_omegaY_eval),
    ),
  );
  const sharedCoeff = field.add(gCombinedCoeff, fCombinedCoeff);
  const sigmaGOpenCoeff = field.neg(
    field.add(
      field.add(field.mul(kappa1Cubed, proof3.R_eval), field.mul(challenges.kappa2, proof3.R_omegaX_eval)),
      field.mul(kappa2Squared, proof3.R_omegaX_omegaY_eval),
    ),
  );

  return g1.msmAffine(
    [
      input.sigma.lagrangeKL,
      input.proof.proof0.B,
      input.sigma.sigma1.x,
      input.sigma.sigma1.y,
      input.preprocess.s0,
      input.preprocess.s1,
      input.sigma.G,
      proof2.Q_CX,
      proof2.Q_CY,
      proof1.R,
    ],
    [
      field.mul(kappa1Squared, field.sub(proof3.R_eval, field.one)),
      field.mul(kappa1Squared, sharedCoeff),
      field.mul(kappa1Squared, field.mul(gCombinedCoeff, theta0)),
      field.mul(kappa1Squared, field.mul(gCombinedCoeff, theta1)),
      field.mul(kappa1Squared, field.mul(fCombinedCoeff, theta0)),
      field.mul(kappa1Squared, field.mul(fCombinedCoeff, theta1)),
      field.add(field.mul(kappa1Squared, field.mul(sharedCoeff, theta2)), sigmaGOpenCoeff),
      field.neg(field.mul(kappa1Squared, domain.tMIEval)),
      field.neg(field.mul(kappa1Squared, domain.tSMaxEval)),
      field.add(field.add(kappa1Cubed, challenges.kappa2), kappa2Squared),
    ],
  );
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
  return g1.sub(
    g1.mulAffineScalar(proof.binding.A_free, field.add(field.one, bindingScalar)),
    g1.mulAffineScalar(sigmaG, field.mul(bindingScalar, aEval)),
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
    g1.mulAffineScalar(proof4.Pi_X, field.mul(challenges.kappa2, challenges.chi)),
    g1.mulAffineScalar(proof4.Pi_Y, field.mul(challenges.kappa2, challenges.zeta)),
    g1.mulAffineScalar(proof4.M_X, field.mul(field.mul(kappa2Squared, omegaMIInv), challenges.chi)),
    g1.mulAffineScalar(proof4.M_Y, field.mul(kappa2Squared, challenges.zeta)),
    g1.mulAffineScalar(proof4.N_X, field.mul(field.mul(kappa2Cubed, omegaMIInv), challenges.chi)),
    g1.mulAffineScalar(proof4.N_Y, field.mul(field.mul(kappa2Cubed, omegaSMaxInv), challenges.zeta)),
  ]);
  const auxX = g1AddMany(g1, [
    g1.mulAffineScalar(proof4.Pi_X, challenges.kappa2),
    g1.mulAffineScalar(proof4.M_X, kappa2Squared),
    g1.mulAffineScalar(proof4.N_X, kappa2Cubed),
  ]);
  const auxY = g1AddMany(g1, [
    g1.mulAffineScalar(proof4.Pi_Y, challenges.kappa2),
    g1.mulAffineScalar(proof4.M_Y, kappa2Squared),
    g1.mulAffineScalar(proof4.N_Y, kappa2Cubed),
  ]);

  return { aux, auxX, auxY };
}

export function g1AddMany(g1: G1Runtime, points: readonly G1Point[]): G1Point {
  return points.reduce((accumulator, point) => g1.add(accumulator, point), g1.zero);
}
