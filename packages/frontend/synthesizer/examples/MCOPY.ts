// DEBUG=ethjs,evm:*,evm:*:* tsx MCOPY.ts
import { hexToBytes } from '@ethereumjs/util'

import { createEVM } from '../src/constructors.js'
import { mapToStr } from '../src/tokamak/utils/index.js'

const main = async () => {
  const evm = await createEVM()
  const res = await evm.runCode({
    code: hexToBytes('0x600160005260026001526003601F5260046021536004601E601B5e601D51'),
  }) // PUSH1 01 -- simple bytecode to push 1 onto the stack
  const stringPlacements = mapToStr(res.runState!.synthesizer.placements)
  console.log(`"placements": ${JSON.stringify(stringPlacements, null, 1)}`)
}

void main()
