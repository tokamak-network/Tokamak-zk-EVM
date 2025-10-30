import { AddressLike, BigIntLike, BytesLike } from "@ethereumjs/util"



/**
 * Legacy {@link Transaction} Data
 */
export type TokamakL2TxData = {
  /**
   * The transaction's nonce.
   */
  nonce: BigIntLike

  /**
   * The transaction's the address is sent to.
   */
  to: AddressLike

  /**
   * This will contain the data of the message or the init of a contract.
   */
  data: BytesLike

  senderPubKey: BytesLike

  /**
   * EDDSA public key.
   */
  v?: BigIntLike

  /**
   * EDDSA randomizer.
   */
  r?: BigIntLike

  /**
   * EDDSA signature.
   */
  s?: BigIntLike
}
