import type { G1Point } from "../../runtime/group/group.js";
import type { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";

export type ProverCommitmentEncoder = (
  polynomial: BivariatePolynomialBuffer,
) => Promise<G1Point>;
