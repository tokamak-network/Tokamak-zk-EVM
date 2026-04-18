import { SubcircuitNames } from "./configuredTypes.ts";
import type { ReservedBuffer, SubcircuitInfoByName, SubcircuitInfoByNameEntry } from './configuredTypes.ts';
export declare const SETUP_PARAMS_KEYS: readonly ["l_free", "l_user_out", "l_user", "l", "l_D", "m_D", "n", "s_D", "s_max"];
export type SetupParams = Record<typeof SETUP_PARAMS_KEYS[number], number>;
export type GlobalWireEntry = readonly [subcircuitId: number, localWireIndex: number];
export type GlobalWireList = GlobalWireEntry[];
export declare const isObjectRecord: (x: unknown) => x is Record<string, unknown>;
export declare const isNumber: (x: unknown) => x is number;
export declare const isSubcircuitName: (x: unknown) => x is SubcircuitNames;
export declare const isTupleNumber2: (x: unknown) => x is [number, number];
export declare const isNumberArray: (x: unknown) => x is number[];
export declare const SUBCIRCUIT_INFO_VALIDATORS: {
    id: (x: unknown) => x is number;
    name: (x: unknown) => x is SubcircuitNames;
    Nwires: (x: unknown) => x is number;
    Nconsts: (x: unknown) => x is number;
    Out_idx: (x: unknown) => x is [number, number];
    In_idx: (x: unknown) => x is [number, number];
    flattenMap: (x: unknown) => x is number[];
};
export type ValidatorMap = typeof SUBCIRCUIT_INFO_VALIDATORS;
type SubcircuitInfoItem = {
    [K in keyof ValidatorMap]: ValidatorMap[K] extends (x: unknown) => x is infer T ? T : never;
};
export type SubcircuitInfo = SubcircuitInfoItem[];
export declare const REQUIRED_CIRCOM_KEYS: readonly ["nPubIn", "nPubOut", "nPrvIn", "nEVMIn", "nPoseidonInputs", "nMtDepth", "nAccumulation", "nPrevBlockHashes", "nJubjubExpBatch", "nSubExpBatch"];
export type CircomKey = typeof REQUIRED_CIRCOM_KEYS[number];
export type FrontendConfig = Record<CircomKey, number>;
export interface SubcircuitLibraryData {
    setupParams: SetupParams;
    globalWireList: GlobalWireList;
    frontendCfg: FrontendConfig;
    subcircuitInfo: SubcircuitInfo;
}
export interface SubcircuitLibraryProvider {
    getData(): Promise<SubcircuitLibraryData>;
    loadWasm(subcircuitId: number): Promise<ArrayBuffer>;
}
export interface ResolvedSubcircuitLibrary {
    data: SubcircuitLibraryData;
    subcircuitInfoByName: SubcircuitInfoByName;
    subcircuitBufferMapping: Record<ReservedBuffer, SubcircuitInfoByNameEntry | undefined>;
    accumulatorInputLimit: number;
    numberOfPrevBlockHashes: number;
    jubjubExpBatchSize: number;
    arithExpBatchSize: number;
    firstArithmeticPlacementIndex: number;
}
export {};
//# sourceMappingURL=libraryTypes.d.ts.map