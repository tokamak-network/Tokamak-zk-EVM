import { bytesToBigInt } from "@synthesizer-libs/util"

const bytesValue = new Uint8Array([97])
const bigIntValue = bytesToBigInt(bytesValue)

console.log(`Converted value: ${bigIntValue}`)
