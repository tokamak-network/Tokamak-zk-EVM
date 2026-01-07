import { TxOptions, TxValuesArray } from "@ethereumjs/tx"
import { TokamakL2Tx } from "./TokamakL2Tx.ts"
import { TokamakL2TxData } from "./types.ts"
import { EthereumJSErrorWithoutCode, RLP } from "@ethereumjs/rlp"
import { Address, bytesToBigInt, bytesToHex, toBytes, validateNoLeadingZeroes } from "@ethereumjs/util"
import { ANY_LARGE_GAS_LIMIT, ANY_LARGE_GAS_PRICE } from "../../synthesizer/params/index.ts"


export function createTokamakL2Tx(txData: TokamakL2TxData, opts: TxOptions): TokamakL2Tx {
    if (opts.common?.customCrypto === undefined) {
        throw new Error("Required 'common.customCrypto'")
    }
    // Set the minimum gasLimit to execute VM._runTx
    const tx =  new TokamakL2Tx({...txData, gasLimit: ANY_LARGE_GAS_LIMIT, gasPrice: ANY_LARGE_GAS_PRICE}, opts)
    tx.initUnsafeSenderPubKey(toBytes(txData.senderPubKey))
    return tx
}

/**
 * Create a transaction from an array of byte encoded values ordered according to the devp2p network encoding - format noted below.
 *
 * Format: `[nonce, gasPrice, gasLimit, to, value, data, v, r, s]`
 */
export function createTokamakL2TxFromBytesArray(values: Uint8Array[], opts: TxOptions): TokamakL2Tx {
  if ( values.length !== 7 ) {
    throw EthereumJSErrorWithoutCode(
      'Invalid transaction. Only expecting 7 values for signed tx.',
    )
  }

  const [nonce, to, data, senderPubKey, v, r, s] = values

  const txDataRaw = {nonce, to, data, senderPubKey, v, r, s}
  validateNoLeadingZeroes(txDataRaw)

  const txDataFormat: TokamakL2TxData = {
    nonce: bytesToBigInt(nonce),
    to: new Address(to),
    data,
    senderPubKey,
    v: bytesToBigInt(v),
    r: bytesToBigInt(r),
    s: bytesToBigInt(s),
  }

  return createTokamakL2Tx(txDataFormat, opts)
}

/**
 * Instantiate a transaction from a RLP serialized tx.
 *
 * Format: `rlp([nonce, gasPrice, gasLimit, to, value, data,
 * signatureV, signatureR, signatureS])`
 */
export function createTokamakL2TxFromRLP(serialized: Uint8Array, opts: TxOptions): TokamakL2Tx {
  const values = RLP.decode(serialized)

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode('Invalid serialized tx input. Must be array')
  }

  return createTokamakL2TxFromBytesArray(values as Uint8Array[], opts)
}