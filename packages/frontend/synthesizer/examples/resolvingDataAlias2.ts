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
    code: hexToBytes(
      '0x' +
        '63' +
        'c0cac01a' + // PUSH4 (0x63) + 4바이트 값 push
        '60' +
        '22' + // PUSH1 (0x60) + 1바이트 값 push
        '52' + // MSTORE (0x52)
        '63' +
        'b01dface' + // PUSH4 (0x63) + 4바이트 값 push
        '60' +
        '1e' + // PUSH1 (0x60) + 1바이트 값 push
        '52' + // MSTORE (0x52)
        '61' +
        '1eaf' + // PUSH2 (0x61) + 2바이트 값 push
        '60' +
        '1c' + // PUSH1 (0x60) + 1바이트 값 push
        '52' + // MSTORE (0x52)
        '62' +
        'ffffff' +
        '60' +
        '20' +
        '52' +
        '60' +
        '20' + // PUSH1 (0x60) + 1바이트 값 push
        '51' + // MLOAD (0x51),
        '00',
    ),
  })

  const stringPlacements = mapToStr(res.runState!.synthesizer.placements)
  console.log('******RESULT******')
  console.log(`stack(str): ${'0x' + res.runState!.stack.peek(1)[0].toString(16)}`) // 3n
  console.log(`stackPt: ${JSON.stringify(res.runState!.stackPt.getStack(), arrToStr, 2)}\n`) // 3n
  console.log(`"placements": ${JSON.stringify(stringPlacements, null, 1)}`)

  const permutation = await finalize(res.runState!.synthesizer.placements)
}

void main()
