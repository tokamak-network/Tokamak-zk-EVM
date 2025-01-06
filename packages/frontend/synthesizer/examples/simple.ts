import { hexToBytes } from '@ethereumjs/util'

import { createEVM } from '../src/constructors.js'
import { mapToStr } from '../src/tokamak/utils/index.js'

const main = async () => {
  const evm = await createEVM()
  const res = await evm.runCode({ code: hexToBytes('0x605A60050A610120526101406000F3') }) // PUSH1 01 -- simple bytecode to push 1 onto the stack
  const stringPlacements = mapToStr(res.runState!.synthesizer.placements)
  console.log(`"placements": ${JSON.stringify(stringPlacements, null, 1)}`)
}

void main()
