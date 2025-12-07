import { setLengthLeft, utf8ToBytes } from "@ethereumjs/util"
export const DST_NONCE = setLengthLeft(utf8ToBytes("TokamakAuth‑EDDSA‑NONCE‑v1"), 32)
export const ANY_LARGE_GAS_LIMIT = 9999999999999999n
export const ANY_LARGE_GAS_PRICE = 9999999n
