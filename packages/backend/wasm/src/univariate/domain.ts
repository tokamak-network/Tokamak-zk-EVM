import type { SetupParams } from "../artifacts/setup/setup-params.js";
import { validateSetupParams } from "../artifacts/setup/validate-setup-params.js";
import { UNIVARIATE_DOMAIN_CONTRACT } from "../generated/univariate-domain-contract.generated.js";
import type { FieldElement, FieldRuntime } from "../runtime/field/field-types.js";

export interface UnivariateDomainShape {
  readonly schema: typeof UNIVARIATE_DOMAIN_CONTRACT.protocolSchema;
  readonly subcircuitCapacity: number;
  readonly arithmeticSize: number;
  readonly connectionSize: number;
  readonly intersectionSize: number;
  readonly unionSize: number;
  readonly arithmeticRoot: FieldElement;
  readonly connectionRoot: FieldElement;
}
/**
 * Derives the U1/U4 domains from the published library dimensions.
 *
 * The arithmetic domain is n*s and the connection domain is m_b*s.
 * The separate selection capacity t reserves its final ID for the empty circuit.
 */
export function deriveUnivariateDomainShape(field: FieldRuntime, setup: SetupParams): UnivariateDomainShape {
  validateSetupParams(setup);
  const subcircuitCapacity = setup.t;
  const arithmeticSize = checkedProduct("N_A", setup.n, setup.s);
  const connectionSize = checkedProduct("N_C", setup.m_b, setup.s);
  const intersectionSize = greatestCommonDivisor(arithmeticSize, connectionSize);
  return {
    schema: UNIVARIATE_DOMAIN_CONTRACT.protocolSchema,
    subcircuitCapacity,
    arithmeticSize,
    connectionSize,
    intersectionSize,
    unionSize: arithmeticSize + connectionSize - intersectionSize,
    arithmeticRoot: field.rootOfUnity(arithmeticSize),
    connectionRoot: field.rootOfUnity(connectionSize),
  };
}
/** U1's canonical flat arithmetic-domain index. */
export function arithmeticIndex(domain: UnivariateDomainShape, setup: SetupParams, placementIndex: number, subcircuitId: number, constraintRow: number): number {
  assertIndex(placementIndex, setup.s, "placement");
  assertIndex(subcircuitId, domain.subcircuitCapacity, "subcircuit");
  assertIndex(constraintRow, setup.n, "constraint row");
  return checkedSum("U1 index", checkedNonnegativeProduct("U1 row offset", setup.s, constraintRow), placementIndex);
}

/** U4's canonical flat connection-domain index. */
export function connectionIndex(
  setup: SetupParams,
  placementIndex: number,
  localWireIndex: number,
): number {
  assertIndex(placementIndex, setup.s, "placement");
  assertIndex(localWireIndex, setup.m_b, "wiring wire");
  return checkedSum(
    "U4 index",
    checkedNonnegativeProduct("U4 wire offset", setup.s, localWireIndex),
    placementIndex,
  );
}

export function arithmeticVanishingAt(
  field: FieldRuntime,
  domain: UnivariateDomainShape,
  point: FieldElement,
): FieldElement {
  return field.sub(field.pow(point, domain.arithmeticSize), field.one);
}

export function unionVanishingAt(
  field: FieldRuntime,
  domain: UnivariateDomainShape,
  point: FieldElement,
): FieldElement {
  return field.mul(
    arithmeticVanishingAt(field, domain, point),
    arithmeticComplementAt(field, domain, point),
  );
}

/** `M_A = Z_C / Z_G`, evaluated as an exact geometric polynomial. */
export function arithmeticComplementAt(
  field: FieldRuntime,
  domain: UnivariateDomainShape,
  point: FieldElement,
): FieldElement {
  return vanishingQuotientAt(field, point, domain.connectionSize, domain.intersectionSize);
}

/** `M_C = Z_A / Z_G`, evaluated as an exact geometric polynomial. */
export function connectionComplementAt(
  field: FieldRuntime,
  domain: UnivariateDomainShape,
  point: FieldElement,
): FieldElement {
  return vanishingQuotientAt(field, point, domain.arithmeticSize, domain.intersectionSize);
}
function checkedProduct(name: string, ...values: readonly number[]): number {
  const result = values.reduce((product, value) => product * value, 1);
  if(!Number.isSafeInteger(result) || result < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return result;
}

function assertIndex(value: number, limit: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= limit) {
    throw new Error(`${label} index is outside its admitted range.`);
  }
}

function checkedNonnegativeProduct(name: string, ...values: readonly number[]): number {
  const result = values.reduce((product, value) => product * value, 1);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
  return result;
}

function checkedSum(name: string, ...values: readonly number[]): number {
  const result = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
  return result;
}

function vanishingQuotientAt(
  field: FieldRuntime,
  point: FieldElement,
  dividendSize: number,
  divisorSize: number,
): FieldElement {
  if (dividendSize % divisorSize !== 0) {
    throw new Error("Vanishing-polynomial quotient requires an integral domain-size ratio.");
  }

  const stride = field.pow(point, divisorSize);
  let term = field.one;
  let sum = field.zero;
  for (let index = 0; index < dividendSize / divisorSize; index += 1) {
    sum = field.add(sum, term);
    term = field.mul(term, stride);
  }
  return sum;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}
