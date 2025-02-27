<<<<<<< HEAD
import { hexToBytes } from "@ethereumjs/util/index.js"

import { createEVM } from '../../src/constructors.js'

const main = async () => {
  const evm = await createEVM()
  const res = await evm.runCode({
    code: hexToBytes(
      '0x610001601F53600051602052602051600051016040526040516020510160605260806000F3',
    ),
  })
  console.log(res)
  console.log(res.runState?.memoryPt)
  console.log(res.executionGasUsed) // 3n
}

void main()
=======
import { hexToBytes } from "@synthesizer-libs/util"

import { createEVM } from '../../src/constructors.js'

const main = async () => {
  const evm = await createEVM()
  const res = await evm.runCode({
    code: hexToBytes(
      '0x610001601F53600051602052602051600051016040526040516020510160605260806000F3',
    ),
  })
  console.log(res)
  console.log(res.runState?.memoryPt)
  console.log(res.executionGasUsed) // 3n
}

void main()
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
