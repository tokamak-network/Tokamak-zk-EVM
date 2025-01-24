import { type Address } from "@ethereumjs/util/index.js";
import { MCLBLS, NobleBLS } from './bls12_381/index.js';
import { NobleBN254, RustBN254 } from './bn254/index.js';
import type { PrecompileFunc, PrecompileInput } from './types.js';
import type { Common } from '@ethereumjs/common/dist/esm/index.js';
interface PrecompileEntry {
    address: string;
    check: PrecompileAvailabilityCheckType;
    precompile: PrecompileFunc;
    name: string;
}
interface Precompiles {
    [key: string]: PrecompileFunc;
}
type PrecompileAvailabilityCheckType = PrecompileAvailabilityCheckTypeHardfork | PrecompileAvailabilityCheckTypeEIP;
declare enum PrecompileAvailabilityCheck {
    EIP = 0,
    Hardfork = 1
}
interface PrecompileAvailabilityCheckTypeHardfork {
    type: PrecompileAvailabilityCheck.Hardfork;
    param: string;
}
interface PrecompileAvailabilityCheckTypeEIP {
    type: PrecompileAvailabilityCheck.EIP;
    param: number;
}
declare const ripemdPrecompileAddress: string;
declare const precompileEntries: PrecompileEntry[];
declare const precompiles: Precompiles;
type DeletePrecompile = {
    address: Address;
};
type AddPrecompile = {
    address: Address;
    function: PrecompileFunc;
};
type CustomPrecompile = AddPrecompile | DeletePrecompile;
declare function getActivePrecompiles(common: Common, customPrecompiles?: CustomPrecompile[]): Map<string, PrecompileFunc>;
declare function getPrecompileName(addressUnprefixedStr: string): string;
export { getActivePrecompiles, getPrecompileName, MCLBLS, NobleBLS, NobleBN254, precompileEntries, precompiles, ripemdPrecompileAddress, RustBN254, };
export type { AddPrecompile, CustomPrecompile, DeletePrecompile, PrecompileFunc, PrecompileInput };
//# sourceMappingURL=index.d.ts.map