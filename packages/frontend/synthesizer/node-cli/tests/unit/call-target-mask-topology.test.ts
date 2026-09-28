import { createAddressFromBigInt } from '@ethereumjs/util';
import type { InterpreterStep, Message } from '@ethereumjs/evm';
import { describe, expect, it, vi } from 'vitest';

import {
  createTransactionInputVariables,
  type Operator,
} from '../../../core/src/subcircuit/configuredTypes.ts';
import { DataPtFactory, MemoryPt, StackPt } from '../../../core/src/synthesizer/dataStructure/index.ts';
import {
  ContextManager,
  createMemoryEntriesFromCopyResult,
  type MessageContext,
} from '../../../core/src/synthesizer/runtime/contextManager.ts';
import {
  UINT32_DATA_PT_TYPE,
  UINT256_DATA_PT_TYPE,
  type DataPt,
  type DataPtType,
} from '../../../core/src/synthesizer/types/dataStructure.ts';

const CALL_OPCODES = ['CALL', 'CALLCODE', 'DELEGATECALL', 'STATICCALL'] as const;
const TRANSACTION_INPUT_VARIABLES = createTransactionInputVariables(29);

type CallOpcode = typeof CALL_OPCODES[number];
const dataPt = (
  value: bigint,
  source: number,
  wireIndex = 0,
  dataPtType: DataPtType = UINT256_DATA_PT_TYPE,
): DataPt => DataPtFactory.create({ source, wireIndex, dataPtType }, value);

const callOperands = (opcode: CallOpcode, target: bigint): bigint[] =>
  opcode === 'CALL' || opcode === 'CALLCODE'
    ? [100_000n, target, 0n, 0n, 0n, 0n, 0n]
    : [100_000n, target, 0n, 0n, 0n, 0n];

const createHarness = (
  opcode: CallOpcode,
  rawTarget: bigint,
  options: {
    stackTarget?: bigint;
    codeAddress?: bigint;
  } = {},
) => {
  const parentContext: MessageContext = {
    stackPt: new StackPt(),
    memoryPt: new MemoryPt(),
    callerPt: dataPt(0x1111n, 1),
    codeAddressPt: dataPt(0x2222n, 2),
    storageAddressPt: dataPt(0x3333n, 3),
    callDataMemoryPts: [],
    callDataByteLength: 0,
    returnDataMemoryPts: [],
    returnDataByteLength: 0,
    prevInterpreterStep: null,
    resultMemoryPts: [],
    resultDataByteLength: 0,
  };
  const interpreterOperands = callOperands(opcode, rawTarget);
  const symbolicOperands = callOperands(opcode, options.stackTarget ?? rawTarget);
  for (const [wireIndex, value] of symbolicOperands.slice().reverse().entries()) {
    parentContext.stackPt.push(dataPt(value, 10, wireIndex));
  }
  parentContext.prevInterpreterStep = {
    opcode: { name: opcode },
    stack: interpreterOperands,
    memory: new Uint8Array(0),
  } as InterpreterStep;

  const compositionCalls: Operator[] = [];
  const placeComposition = vi.fn((name: Operator, inPts: DataPt[] | DataPt[][]) => {
    compositionCalls.push(name);
    if (name === 'MemoryView') {
      return (inPts as DataPt[][]).map((view) => view[0] ?? dataPt(0n, 5));
    }
    throw new Error(`Unexpected composition ${name}`)
  });
  const placementManager = {
    placements: [],
    numberOfPrivateMessageInputs: TRANSACTION_INPUT_VARIABLES.length,
    placeComposition,
    getLogOutWireLength: vi.fn(() => 0),
  };
  const contextManager = new ContextManager(placementManager as never);
  contextManager.contextByDepth[0] = parentContext;
  const beginFrame = vi.spyOn(contextManager, 'beginFrame');
  const recordMessageCodeAddress = vi.spyOn(contextManager, 'recordMessageCodeAddress');
  const message = {
    depth: 1,
    codeAddress: createAddressFromBigInt(options.codeAddress ?? rawTarget),
    isCreate: false,
    isCompiled: false,
  } as Message;

  return {
    beginFrame,
    compositionCalls,
    message,
    parentContext,
    placeComposition,
    recordMessageCodeAddress,
    contextManager,
  };
};

describe('CALL-family target-word topology', () => {
  it('uses the verified uint256 contract address for both root context address roles', () => {
    const placementManager = {
      placements: [],
      numberOfPrivateMessageInputs: TRANSACTION_INPUT_VARIABLES.length,
      getLogOutWireLength: vi.fn(() => 0),
    };
    const contextManager = new ContextManager(placementManager as never);
    const verifiedContractAddressPt = dataPt(0x1234n, 1);
    const originPt = dataPt(0x5678n, 2);
    const selectorPt = dataPt(0xabcdn, 3, 0, UINT32_DATA_PT_TYPE);
    const transactionInputPts = TRANSACTION_INPUT_VARIABLES.map((_, index) =>
      dataPt(BigInt(index), 4, index),
    );

    contextManager.setVerifiedTransactionData(
      verifiedContractAddressPt,
      selectorPt,
      originPt,
      transactionInputPts,
    );
    contextManager.initializeMessageContext({
      depth: 0,
      codeAddress: createAddressFromBigInt(verifiedContractAddressPt.value),
      data: new Uint8Array(4 + 32 * TRANSACTION_INPUT_VARIABLES.length),
      isCreate: false,
      isCompiled: false,
    } as Message);

    const rootContext = contextManager.contextByDepth[0]!;
    expect(rootContext.codeAddressPt).toMatchObject({
      value: verifiedContractAddressPt.value,
      dataPtType: UINT256_DATA_PT_TYPE,
    });
    expect(rootContext.storageAddressPt).toMatchObject({
      value: verifiedContractAddressPt.value,
      dataPtType: UINT256_DATA_PT_TYPE,
    });
    expect(rootContext.callerPt).toMatchObject({
      value: originPt.value,
      dataPtType: UINT256_DATA_PT_TYPE,
    });
  });

  it.each(CALL_OPCODES)('routes the %s target word into the child context without a normalizer', (opcode) => {
    const rawTarget = 0x1234n;
    const harness = createHarness(opcode, rawTarget);

    const memoryCopyPlan = harness.contextManager.prepareChildCallData(harness.message);
    const callDataPts = harness.placeComposition('MemoryView', memoryCopyPlan.memoryViewOperands);
    harness.contextManager.initializeMessageContext(
      harness.message,
      createMemoryEntriesFromCopyResult(memoryCopyPlan, callDataPts),
    );

    expect(harness.compositionCalls).not.toContain('AND');
    expect(harness.beginFrame).toHaveBeenCalledOnce();
    expect(harness.beginFrame).toHaveBeenCalledWith(1);
    expect(harness.recordMessageCodeAddress).toHaveBeenCalledOnce();
    expect(harness.recordMessageCodeAddress).toHaveBeenCalledWith(
      harness.message.codeAddress.toString(),
    );

    const childContext = harness.contextManager.contextByDepth[1];
    expect(childContext.codeAddressPt).toMatchObject({
      value: 0x1234n,
      source: 10,
      wireIndex: opcode === 'CALL' || opcode === 'CALLCODE' ? 5 : 4,
    });
    if (opcode === 'CALL' || opcode === 'STATICCALL') {
      expect(childContext.storageAddressPt).toMatchObject({
        source: 10,
        wireIndex: opcode === 'CALL' || opcode === 'CALLCODE' ? 5 : 4,
      });
    } else {
      expect(childContext.storageAddressPt).toMatchObject({
        source: harness.parentContext.storageAddressPt.source,
        wireIndex: harness.parentContext.storageAddressPt.wireIndex,
      });
    }
  });

  it('rejects a child address that is not the exact parent stack target word', () => {
    const rawTarget = (1n << 200n) | 0x1234n;
    const harness = createHarness('CALL', rawTarget, { codeAddress: 0x1234n });

    expect(() => harness.contextManager.initializeMessageContext(harness.message)).toThrow(
      'Address to call mismatch between EVM and Synthesizer',
    );
    expect(harness.compositionCalls).not.toContain('AND');
    expect(harness.beginFrame).not.toHaveBeenCalled();
  });

  it('rejects a substituted raw target before materializing the child context', () => {
    const harness = createHarness('CALL', 0x1234n, { stackTarget: 0x5678n });

    expect(() => harness.contextManager.initializeMessageContext(harness.message)).toThrow(
      'Raw address to call mismatch',
    );
    expect(harness.placeComposition).not.toHaveBeenCalled();
    expect(harness.beginFrame).not.toHaveBeenCalled();
  });

});
