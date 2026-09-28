
// -----------------------------------------------------------------------------
// Types (internal): keep these un-exported as requested
// -----------------------------------------------------------------------------

import { SUBCIRCUIT_LIST, SubcircuitNames, type TransactionInputVariable } from "./configuredTypes.ts";
import type { PlacementCompositionMapping } from './placementCompositionMapping.ts';
import type { calculateSubcircuitOutputValues } from './subcircuitOutputOperations.ts';
import type {
  ReservedBuffer,
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
} from './configuredTypes.ts';

export const SETUP_PARAMS_KEYS = ['n', 'm', 'm_b', 't', 's'] as const;

export type PublicWirePhase = Readonly<{
  name: string;
  region: 'free' | 'fixed';
  subcircuitIds: readonly number[];
}>;

export type SetupParams = Record<typeof SETUP_PARAMS_KEYS[number], number> & Readonly<{
  publicWirePhases: readonly PublicWirePhase[];
}>;

export type LogicalInterfaceType =
  | Readonly<{ kind: 'uint'; bits: number }>
  | Readonly<{ kind: 'bls12-381-fr' }>
  | Readonly<{ kind: 'jubjub-scalar' }>;

export type LogicalInterfacePort = Readonly<{
  name: string;
  logicalType: LogicalInterfaceType;
}>;

export type LogicalInterface = Readonly<{
  inputs: readonly LogicalInterfacePort[];
  outputs: readonly LogicalInterfacePort[];
}>;

export type BufferDirection = 'in' | 'out';

// Primitive validators
export const isObjectRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null;
export const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const isSubcircuitName = (x: unknown): x is SubcircuitNames =>
  typeof x === 'string' && SUBCIRCUIT_LIST.some((name) => name === x);
export const isTupleNumber2 = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length === 2 && isNumber(x[0]) && isNumber(x[1]);
export const isNumberArray = (x: unknown): x is number[] => Array.isArray(x) && x.every(isNumber);

type SubcircuitInfoItem = {
  id: number;
  name: SubcircuitNames;
  Nwires: number;
  NrealWires: number;
  Nconsts: number;
  Out_idx: [number, number];
  In_idx: [number, number];
  Wiring_idx: [number, number];
  Public_idx: [number, number];
  Internal_idx: [number, number];
  logicalInterface?: LogicalInterface;
  bufferDirection?: BufferDirection;
  publicPhase?: string;
};
// Array of items
export type SubcircuitInfo = SubcircuitInfoItem[];

// Required Circom constants (qap-compiler/subcircuits/circom/constants.circom).
// Every buffer n* constant is an input-wire capacity and requires no scaling.
export const REQUIRED_CIRCOM_KEYS = [
  'nTxIn',
  'nStorageLoad',
  'nLogOut',
  'nStorageStore',
  'nBlockIn',
  'nPrvIn',
  'nEVMIn',
  'nPrivateMessageInputs',
  'nPoseidonInputs',
  'nPoseidonBatch',
  'nPrevBlockHashes',
] as const;
export type CircomKey = typeof REQUIRED_CIRCOM_KEYS[number];

export type FrontendConfig = Record<CircomKey, number>;

export interface SubcircuitLibraryData {
  setupParams: SetupParams;
  frontendCfg: FrontendConfig;
  subcircuitInfo: SubcircuitInfo;
}

export interface SubcircuitLibraryProvider {
  getData(): Promise<SubcircuitLibraryData>;
  loadWasm(subcircuitId: number): Promise<ArrayBuffer>;
}

export interface ResolvedSubcircuitLibrary {
  data: SubcircuitLibraryData;
  loadWasm(subcircuitId: number): Promise<ArrayBuffer>;
  placementCompositionMapping: PlacementCompositionMapping;
  calculateSubcircuitOutputValues: typeof calculateSubcircuitOutputValues;
  subcircuitInfoByName: SubcircuitInfoByName;
  subcircuitBufferMapping: Record<ReservedBuffer, SubcircuitInfoByNameEntry | undefined>;
  transactionInputVariables: readonly TransactionInputVariable[];
  numberOfPrevBlockHashes: number;
}
