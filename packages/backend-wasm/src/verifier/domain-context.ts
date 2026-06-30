import type { EvaluationDomain } from "../libs/polynomial/domain.js";

export interface VerifierDomainContext {
  readonly domain: EvaluationDomain;
}
