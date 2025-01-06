//DEBUG=ethjs,evm:ops:* tsx resolvingDataAlias.ts
import { hexToBytes } from '@ethereumjs/util'

import { createEVM } from '../src/constructors.js'

import type { ExecResult } from '../src/types.js'
import { finalize } from '../src/tokamak/core/finalize.js'

function arrToStr(key: string, value: any) {
  return typeof value === 'bigint' ? value.toString() : value
}
const mapToStr = (map: Map<any, any>) => {
  return Object.fromEntries(
    Array.from(map, ([key, value]) => [
      key,
      JSON.parse(JSON.stringify(value, (k, v) => (typeof v === 'bigint' ? v.toString() : v))),
    ]),
  )
}

const printEvmResult = (res: ExecResult) => {
  const stringPlacements = mapToStr(res.runState!.synthesizer.placements)
  console.log('******RESULT******')
  console.log(`stack(str): ${'0x' + res.runState!.stack.peek(1)[0].toString(16)}`)
  console.log(`stackPt: ${JSON.stringify(res.runState!.stackPt.getStack(), arrToStr, 2)}\n`)
  console.log(`"placements": ${JSON.stringify(stringPlacements, null, 1)}`)
}

const main = async () => {
  const evm = await createEVM()

  const res = await evm.runCode({
    code: hexToBytes('0x63c0cac01a60225263b01dface601e52611eaf601c52602051'),
  })

  const stringPlacements = mapToStr(res.runState!.synthesizer.placements)
  console.log('******RESULT******')
  console.log(`stack(str): ${'0x' + res.runState!.stack.peek(1)[0].toString(16)}`) // 3n
  console.log(`stackPt: ${JSON.stringify(res.runState!.stackPt.getStack(), arrToStr, 2)}\n`) // 3n
  console.log(`"placements": ${JSON.stringify(stringPlacements, null, 1)}`)
  const permutation = await finalize(res.runState!.synthesizer.placements)
}

void main()
