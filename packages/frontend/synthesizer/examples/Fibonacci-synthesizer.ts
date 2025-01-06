import { hexToBytes } from '@ethereumjs/util'

import { createEVM } from '../src/constructors.js'

const main = async () => {
  const evm = await createEVM()
  console.log('*****TOKAMAK START****')
  console.log(evm)
  const res = await evm.runCode({
    code: hexToBytes(
      '0x610001601F53600051602052602051600051016040526040516020510160605260806000F3',
    ),
  })
  console.log('*****TOKAMAK END****')
  console.log(res)
  console.log(res.runState?.memoryPt)
  console.log(res.executionGasUsed) // 3n
}

void main()
