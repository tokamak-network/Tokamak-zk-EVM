import { describe, expect, it, vi } from 'vitest';

import { BUFFER_LIST } from '../../../core/src/subcircuit/configuredTypes.ts';
import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts';
import { MemoryPt } from '../../../core/src/synthesizer/dataStructure/memoryPt.ts';
import { StackPt } from '../../../core/src/synthesizer/dataStructure/stackPt.ts';
import { InstructionHandler } from '../../../core/src/synthesizer/runtime/instructionHandler.ts';
import { ContextManager, type MessageContext } from '../../../core/src/synthesizer/runtime/contextManager.ts';
import { calculateSubcircuitOutputValues } from '../../../core/src/subcircuit/subcircuitOutputOperations.ts';
import {
  UINT256_DATA_PT_TYPE,
  type DataPt,
  type DataPtType,
} from '../../../core/src/synthesizer/types/dataStructure.ts';

const evmInSource = BUFFER_LIST.indexOf('EVM_IN')

const dataPt = (
  value: bigint,
  source: number,
  wireIndex = 0,
  dataPtType: DataPtType = UINT256_DATA_PT_TYPE,
): DataPt => DataPtFactory.create({ source, wireIndex, dataPtType }, value)

const createContext = (): MessageContext => ({
  stackPt: new StackPt(),
  memoryPt: new MemoryPt(),
  callerPt: dataPt(1n, 1),
  codeAddressPt: dataPt(2n, 2),
  storageAddressPt: dataPt(3n, 3),
  callDataMemoryPts: [],
  callDataByteLength: 0,
  returnDataMemoryPts: [],
  returnDataByteLength: 0,
  prevInterpreterStep: null,
  resultMemoryPts: [],
  resultDataByteLength: 0,
})

const createHarness = () => {
  let staticWireIndex = 0
  const placementManager = {
    allocateEVMInDataPt: vi.fn((value: bigint, dataPtType: DataPtType) =>
      dataPt(value, evmInSource, staticWireIndex++, dataPtType)),
    placeComposition: vi.fn((_operation: string, operands: readonly (readonly DataPt[])[]) =>
      operands.map((view, viewIndex) => {
        let previousWord = 0n
        let previousOwnership = 0n
        for (let index = 0; index < view.length; index += 3) {
          [previousWord, previousOwnership] = calculateSubcircuitOutputValues(
            'MemoryViewStep',
            [
              view[index]!.value,
              view[index + 1]!.value,
              view[index + 2]!.value,
              previousWord,
              previousOwnership,
            ],
          )
        }
        return dataPt(previousWord, 99, viewIndex)
      })),
  }
  const subcircuitLibrary = {}
  const contextManager = new ContextManager(placementManager as never)
  const handler = new InstructionHandler(
    contextManager,
    placementManager,
    subcircuitLibrary as never,
    {} as never,
  )
  return { handler, placementManager }
}

const stackFor = (inputs: bigint[]): StackPt => {
  const stack = new StackPt()
  for (const value of inputs.slice().reverse()) {
    stack.push(dataPt(value, 20 + stack.length))
  }
  return stack
}

describe('RETURNDATACOPY memory flow', () => {
  it('copies the requested returndata view into the requested destination offset', () => {
    const { handler, placementManager } = createHarness()
    const context = createContext()
    context.returnDataMemoryPts = [{
      memByteOffset: 0,
      containerByteSize: 4,
      dataPt: dataPt(0x11223344n, 1),
    }]
    context.returnDataByteLength = 4
    const memoryPt = new MemoryPt()
    const stackPt = stackFor([8n, 0n, 4n])

    handler.handleEnvironmentOpcode([8n, 0n, 4n], null, {
      op: 'RETURNDATACOPY',
      pc: 0n,
      thisAddress: {} as never,
      codeAddress: {} as never,
      originAddress: {} as never,
      callerAddress: {} as never,
      callDepth: 0,
      thisContext: context,
      prevStepResult: {} as never,
      stackPt,
      memoryPt,
      memOut: new Uint8Array([0x11, 0x22, 0x33, 0x44]),
    })

    expect(placementManager.placeComposition).toHaveBeenCalledOnce()
    expect(memoryPt.viewMemory(8, 4)).toEqual(new Uint8Array([0x11, 0x22, 0x33, 0x44]))
  })

  it('rejects a returndata range beyond the child result before recording a composition', () => {
    const { handler, placementManager } = createHarness()
    const context = createContext()
    context.returnDataMemoryPts = [{
      memByteOffset: 0,
      containerByteSize: 4,
      dataPt: dataPt(0x11223344n, 1),
    }]
    context.returnDataByteLength = 4
    const memoryPt = new MemoryPt()

    expect(() => handler.handleEnvironmentOpcode([0n, 0n, 5n], null, {
      op: 'RETURNDATACOPY',
      pc: 0n,
      thisAddress: {} as never,
      codeAddress: {} as never,
      originAddress: {} as never,
      callerAddress: {} as never,
      callDepth: 0,
      thisContext: context,
      prevStepResult: {} as never,
      stackPt: stackFor([0n, 0n, 5n]),
      memoryPt,
      memOut: new Uint8Array(5),
    })).toThrow('RETURNDATACOPY: requested range exceeds return data')
    expect(placementManager.placeComposition).not.toHaveBeenCalled()
    expect(memoryPt.viewMemory(0, 5)).toEqual(new Uint8Array(5))
  })
})

describe('CALLDATACOPY memory flow', () => {
  it('copies the available calldata suffix and zero-fills the remainder', () => {
    const { handler, placementManager } = createHarness()
    const context = createContext()
    context.callDataMemoryPts = [{
      memByteOffset: 0,
      containerByteSize: 4,
      dataPt: dataPt(0x11223344n, 1),
    }]
    context.callDataByteLength = 4
    const memoryPt = new MemoryPt()
    const expected = new Uint8Array([0x33, 0x44, 0, 0, 0, 0])

    handler.handleEnvironmentOpcode([8n, 2n, 6n], null, {
      op: 'CALLDATACOPY',
      pc: 0n,
      thisAddress: {} as never,
      codeAddress: {} as never,
      originAddress: {} as never,
      callerAddress: {} as never,
      callDepth: 0,
      thisContext: context,
      prevStepResult: {} as never,
      stackPt: stackFor([8n, 2n, 6n]),
      memoryPt,
      memOut: expected,
    })

    expect(placementManager.placeComposition).toHaveBeenCalledOnce()
    expect(memoryPt.viewMemory(8, 6)).toEqual(expected)
  })
})
