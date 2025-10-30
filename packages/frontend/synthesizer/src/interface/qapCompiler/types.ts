
// -----------------------------------------------------------------------------
// Types (internal): keep these un-exported as requested
// -----------------------------------------------------------------------------

import { SUBCIRCUIT_LIST, SubcircuitNames } from "./configuredTypes.ts";

// Single source of truth for SetupParams keys
export const SETUP_PARAMS_KEYS = [
  'l', 'l_in', 'l_out',
  'l_D', 'm_D', 'n', 's_D', 's_max',
] as const;

// Shapes used by typed exports below
export type SetupParams = Record<typeof SETUP_PARAMS_KEYS[number], number>;
export type GlobalWireEntry = [subcircuitId: number, localWireIndex: number];
export type GlobalWireList = GlobalWireEntry[];

// Primitive validators
export const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const isString = (x: unknown): x is string => typeof x === 'string';
export const isSubcircuitName = (x: unknown): x is SubcircuitNames => typeof x === 'string' && (SUBCIRCUIT_LIST as readonly string[]).includes(x);
export const isTupleNumber2 = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length === 2 && isNumber(x[0]) && isNumber(x[1]);
export const isNumberArray = (x: unknown): x is number[] => Array.isArray(x) && x.every(isNumber);

// Validator map that also drives the SubcircuitInfo shape
export const SUBCIRCUIT_INFO_VALIDATORS = {
  id: isNumber,
  name: isSubcircuitName,
  Nwires: isNumber,
  Nconsts: isNumber,
  Out_idx: isTupleNumber2,
  In_idx: isTupleNumber2,
  flattenMap: isNumberArray,
} as const;

export type ValidatorMap = typeof SUBCIRCUIT_INFO_VALIDATORS;
// Derive the item shape from the validator map (no duplication)
type SubcircuitInfoItem = { [K in keyof ValidatorMap]: ValidatorMap[K] extends (x: unknown) => x is infer T ? T : never };
// Array of items
export type SubcircuitInfo = SubcircuitInfoItem[];

// Required Circom constants (qap-compiler/scripts/constants.circom)
export const REQUIRED_CIRCOM_KEYS = [
  'nPubIn',
  'nPubOut',
  'nPrvIn',
  'nEVMIn',
  'nPoseidonInputs',
  'nMtLeaves',
  'nAccumulation',
  'nPrevBlockHashes',
] as const;
export type CircomKey = typeof REQUIRED_CIRCOM_KEYS[number];

export type CircomConstMap = Record<CircomKey, number>;