import { TxOptions, TxValuesArray } from "@ethereumjs/tx"
import { TokamakL2Tx } from "./TokamakL2Tx.ts"
import { TokamakL2TxData } from "./types.ts"
import { EthereumJSErrorWithoutCode, RLP } from "@ethereumjs/rlp"
import { bytesToHex, toBytes, validateNoLeadingZeroes } from "@ethereumjs/util"
import { ANY_LARGE_GAS_LIMIT, ANY_LARGE_GAS_PRICE } from "src/tokamak/params/index.ts"


export function createTokamakL2Tx(txData: TokamakL2TxData, opts: TxOptions) {
    if (opts.common?.customCrypto === undefined) {
        throw new Error("Required 'common.customCrypto'")
    }
    // Set the minimum gasLimit to execute VM._runTx
    const tx =  new TokamakL2Tx({...txData, gasLimit: ANY_LARGE_GAS_LIMIT, gasPrice: ANY_LARGE_GAS_PRICE}, opts)
    tx.initSenderPubKey(toBytes(txData.senderPubKey))
    return tx
}

/**
 * Create a transaction from an array of byte encoded values ordered according to the devp2p network encoding - format noted below.
 *
 * Format: `[nonce, gasPrice, gasLimit, to, value, data, v, r, s]`
 */
export function createTokamakL2TxFromBytesArray(values: Uint8Array[], opts: TxOptions) {
  // If length is not 3, it has length 6. If v/r/s are empty Uint8Arrays, it is still an unsigned transaction
  // This happens if you get the RLP data from `raw()`
  if (values.length !== 3 && values.length !== 6) {
    throw EthereumJSErrorWithoutCode(
      'Invalid transaction. Only expecting 3 values (for unsigned tx) or 6 values (for signed tx).',
    )
  }

  const [nonce, to, data, v, r, s] = values

  const txData = {nonce, to, data, v, r, s}
  validateNoLeadingZeroes(txData)

  createTokamakL2Tx(txData as TokamakL2TxData, opts)
}

/**
 * Instantiate a transaction from a RLP serialized tx.
 *
 * Format: `rlp([nonce, gasPrice, gasLimit, to, value, data,
 * signatureV, signatureR, signatureS])`
 */
export function createTokamakL2TxFromRLP(serialized: Uint8Array, opts: TxOptions) {
  const values = RLP.decode(serialized)

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode('Invalid serialized tx input. Must be array')
  }

  return createTokamakL2TxFromBytesArray(values as Uint8Array[], opts)
}