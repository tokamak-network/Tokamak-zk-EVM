import { hexToBytes } from '@ethereumjs/util'

import { createEVM } from '../src/constructors.js'
import { mapToStr } from '../src/tokamak/utils/index.js'

const main = async () => {
  const evm = await createEVM()
  const res = await evm.runCode({
    code: hexToBytes(
      '0x30313233343638602060006020393a303b602060006000303c3d303f40414243444546476000496020600020',
    ),
  }) // PUSH1 01 -- simple bytecode to push 1 onto the stack
  const stringPlacements = mapToStr(res.runState!.synthesizer.placements)
  console.log(`"placements": ${JSON.stringify(stringPlacements, null, 1)}`)
}

void main()
