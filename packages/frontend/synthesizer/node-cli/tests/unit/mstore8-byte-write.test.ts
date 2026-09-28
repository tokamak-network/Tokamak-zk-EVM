import { createAddressFromBigInt } from '@ethereumjs/util'
import type { InterpreterStep } from '@ethereumjs/evm'
import { describe, expect, it, vi } from 'vitest'

import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts'
import { MemoryPt } from '../../../core/src/synthesizer/dataStructure/memoryPt.ts'
import { StackPt } from '../../../core/src/synthesizer/dataStructure/stackPt.ts'
import type { ResolvedSubcircuitLibrary } from '../../../core/src/subcircuit/libraryTypes.ts'
import { InstructionHandler, type OpcodeExecutionContext } from '../../../core/src/synthesizer/runtime/instructionHandler.ts'
import type { ContextManager, MessageContext } from '../../../core/src/synthesizer/runtime/contextManager.ts'
import type { PlacementManager } from '../../../core/src/synthesizer/runtime/placementManager.ts'
import type { SynthesizerOpts } from '../../../core/src/synthesizer/types/index.ts'
import { UINT256_DATA_PT_TYPE, type DataPt } from '../../../core/src/synthesizer/types/dataStructure.ts'

const wordPt = (value: bigint, source: number): DataPt => DataPtFactory.create({
  source,
  wireIndex: 0,
  dataPtType: UINT256_DATA_PT_TYPE,
}, value)

describe('MSTORE8 byte writes', () => {
  it('records the original word without an AND placement and projects its low byte', async () => {
    const placeComposition = vi.fn(() => {
      throw new Error('MSTORE8 must not place a composition')
    })
    const instructionHandler = new InstructionHandler(
      {} as ContextManager,
      { placeComposition } as unknown as PlacementManager,
      {} as ResolvedSubcircuitLibrary,
      {} as SynthesizerOpts,
    )
    const stackPt = new StackPt()
    const originalDataPt = wordPt(0x1234n, 1)
    const offsetPt = wordPt(7n, 2)
    stackPt.push(originalDataPt)
    stackPt.push(offsetPt)
    const memoryPt = new MemoryPt()
    const opts: OpcodeExecutionContext = {
      op: 'MSTORE8',
      pc: 0n,
      thisAddress: createAddressFromBigInt(0n),
      codeAddress: createAddressFromBigInt(0n),
      originAddress: createAddressFromBigInt(0n),
      callerAddress: createAddressFromBigInt(0n),
      callDepth: 0,
      thisContext: {} as MessageContext,
      prevStepResult: {} as InterpreterStep,
      stackPt,
      memoryPt,
      memOut: new Uint8Array([0x34]),
    }

    await instructionHandler.handleSysFlow([7n, 0x1234n], null, opts)

    expect(placeComposition).not.toHaveBeenCalled()
    expect(memoryPt.viewMemory(7, 1)).toEqual(new Uint8Array([0x34]))
    expect(memoryPt.getDataAlias(7, 1)[0]!.dataPt).toMatchObject({
      source: originalDataPt.source,
      wireIndex: originalDataPt.wireIndex,
      value: originalDataPt.value,
      dataPtType: originalDataPt.dataPtType,
    })
  })

  it('projects every narrow entry to its low container bytes without changing a word entry', () => {
    const memoryPt = new MemoryPt()
    memoryPt.write(0, 1, wordPt(0x1234n, 1))
    memoryPt.write(1, 2, wordPt(0x1234n, 2))
    memoryPt.write(3, 32, wordPt(0x1234n, 3))

    expect(memoryPt.viewMemory(0, 1)).toEqual(new Uint8Array([0x34]))
    expect(memoryPt.viewMemory(1, 2)).toEqual(new Uint8Array([0x12, 0x34]))
    expect(memoryPt.viewMemory(3, 32)).toEqual(new Uint8Array([
      ...new Uint8Array(30),
      0x12,
      0x34,
    ]))
  })
})
