import { bytesToHex } from "@ethereumjs/util/index.js";
import { sha256 } from 'ethereum-cryptography/sha256.js';
import { OOGResult } from '../evm.js';
import { gasLimitCheck } from './util.js';
import { getPrecompileName } from './index.js';
export function precompile02(opts) {
    const pName = getPrecompileName('02');
    const data = opts.data;
    const sha256Function = opts.common.customCrypto.sha256 ?? sha256;
    let gasUsed = opts.common.param('sha256Gas');
    gasUsed += opts.common.param('sha256WordGas') * BigInt(Math.ceil(data.length / 32));
    if (!gasLimitCheck(opts, gasUsed, pName)) {
        return OOGResult(opts.gasLimit);
    }
    const hash = sha256Function(data);
    if (opts._debug !== undefined) {
        opts._debug(`${pName} return hash=${bytesToHex(hash)}`);
    }
    return {
        executionGasUsed: gasUsed,
        returnValue: hash,
    };
}
//# sourceMappingURL=02-sha256.js.map