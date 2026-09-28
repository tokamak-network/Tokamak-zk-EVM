import { afterEach, describe, expect, it, vi } from 'vitest';

import { Synthesizer } from '../../../core/src/synthesizer/synthesizer.ts';
import { DataPtFactory, MemoryPt, StackPt } from '../../../core/src/synthesizer/dataStructure/index.ts';
import { ContextManager, type MessageContext } from '../../../core/src/synthesizer/runtime/contextManager.ts';
import { UINT256_DATA_PT_TYPE } from '../../../core/src/synthesizer/types/dataStructure.ts';

type EventListener = (data: any, resolve?: () => void) => void;

class TestEventEmitter {
  private listeners = new Map<string, EventListener>();

  on(event: string, listener: EventListener): this {
    this.listeners.set(event, listener);
    return this;
  }

  async emit(event: string, data: any): Promise<void> {
    const listener = this.listeners.get(event);
    if (listener === undefined) {
      throw new Error(`Missing listener for ${event}`);
    }
    await new Promise<void>((resolve, reject) => {
      try {
        listener(data, resolve);
      } catch (err) {
        reject(err);
      }
    });
  }
}

const createBareSynthesizer = (): Synthesizer => {
  const synthesizer = Object.create(Synthesizer.prototype) as Synthesizer;
  Object.defineProperty(synthesizer, '_cachedOpts', {
    value: {
      signedTransaction: {},
      stateManager: {},
    },
  });
  Object.defineProperty(synthesizer, '_placementManager', {
    value: {
      getReservedInputBufferDataPt: vi.fn(() => ({ value: 1n })),
      addReservedVariableToBufferOut: vi.fn(),
    },
  });
  Object.defineProperty(synthesizer, '_contextManager', {
    configurable: true,
    value: {
      returnMessageCall: vi.fn(),
      completeFrame: vi.fn(),
    },
  });
  return synthesizer;
};

const dataPt = (value: bigint, source: number) => DataPtFactory.create({
  source,
  wireIndex: 0,
  dataPtType: UINT256_DATA_PT_TYPE,
}, value);

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Synthesizer VM lifecycle', () => {
  it('delegates final storage output to ContextManager during successful transaction finalization', () => {
    const vmEvents = new TestEventEmitter();
    const evmEvents = new TestEventEmitter();

    const synthesizer = createBareSynthesizer();
    const finalizeStorageStores = vi.fn();
    Object.defineProperty(synthesizer, '_contextManager', {
      value: {
        finalizeStorageStores,
      },
    });
    ;(synthesizer as any)._contextManager.finalizeStorageStores()

    expect(finalizeStorageStores).toHaveBeenCalledOnce();
  });

  it('records the first step-handler error and skips later handlers', async () => {
    const vmEvents = new TestEventEmitter();
    const evmEvents = new TestEventEmitter();

    const synthesizer = createBareSynthesizer();
    const firstError = new Error('first Synthesizer failure');
    const applyHandler = vi.fn().mockRejectedValue(firstError);
    (synthesizer as any)._applySynthesizerHandler = applyHandler;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    ;(synthesizer as any)._attachSynthesizerToVM({ events: vmEvents, evm: { events: evmEvents } })
    const step = { opcode: { name: 'ADD' } };
    await evmEvents.emit('step', step);
    await evmEvents.emit('step', step);

    expect((synthesizer as any)._eventHandlerError).toBe(firstError)
    expect(applyHandler).toHaveBeenCalledTimes(1);
  });

  it('records an afterMessage handler error', async () => {
    const vmEvents = new TestEventEmitter();
    const evmEvents = new TestEventEmitter();

    const synthesizer = createBareSynthesizer();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    ;(synthesizer as any)._attachSynthesizerToVM({ events: vmEvents, evm: { events: evmEvents } })
    await evmEvents.emit('afterMessage', { execResult: { runState: undefined } });

    expect((synthesizer as any)._eventHandlerError).toEqual(
      expect.objectContaining({ message: 'Failed to capture the final state' }),
    )
  });

  it('copies a child result into its parent returndata boundary', () => {
    const synthesizer = createBareSynthesizer();
    const parentContext = createContext();
    const childContext = createContext();
    const childResultPt = dataPt(0x11223344n, 9);
    childContext.resultMemoryPts = [{
      memByteOffset: 0,
      containerByteSize: 4,
      dataPt: childResultPt,
    }];
    childContext.resultDataByteLength = 4;
    const contextManager = new ContextManager({} as never)
    contextManager.contextByDepth = [parentContext, childContext]
    contextManager.returnMessageCall(1)

    expect(parentContext.returnDataByteLength).toBe(4);
    expect(parentContext.returnDataMemoryPts).toEqual(childContext.resultMemoryPts);
    expect(parentContext.returnDataMemoryPts[0]!.dataPt).not.toBe(childResultPt);
  });
});
