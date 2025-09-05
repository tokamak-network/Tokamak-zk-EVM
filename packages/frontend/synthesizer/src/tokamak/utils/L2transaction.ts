import { createLegacyTx, LegacyTx, LegacyTxData } from "@ethereumjs/tx";
import { L2TxData } from "../types/L2transaction.ts";
import { bigIntToBytes, concatBytes, setLengthLeft } from "@ethereumjs/util";

export function createLegacyTxFromL2Tx(txData: L2TxData): LegacyTx {
    const functionSelector = txData.functionSelector
    if (functionSelector >= 1n << (4n * 8n)) {
        throw new Error('Invalid function selector')
    }
    const callData = concatBytes(
        setLengthLeft(bigIntToBytes(functionSelector), 4),
        ...txData.functionInputs.map(n => setLengthLeft(bigIntToBytes(n), 32)),
    )
    const legacyTxData: LegacyTxData = {
            to: txData.to,
            value: 0n,
            data: callData,
            gasLimit: 999999n,
            gasPrice: 4936957717n,
      }
    return createLegacyTx(legacyTxData)
}