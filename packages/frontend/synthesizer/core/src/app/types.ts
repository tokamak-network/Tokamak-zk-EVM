import type { StateSnapshot, TxSnapshot } from 'tokamak-l2js';
import type { CircuitArtifacts } from '../circuitGenerator/types/types.ts';
import type { ResolvedSubcircuitLibrary } from '../subcircuit/libraryTypes.ts';
import type { SynthesizerInterface } from '../synthesizer/types/index.ts';

export type BlockInfo = {
  coinBase: `0x${string}`;
  timeStamp: `0x${string}`;
  blockNumber: `0x${string}`;
  prevRanDao: `0x${string}`;
  gasLimit: `0x${string}`;
  chainId: `0x${string}`;
  selfBalance: `0x${string}`;
  baseFee: `0x${string}`;
  prevBlockHashes: `0x${string}`[];
};

export type ContractCodeEntry = {
  address: string;
  code: string;
};

export interface SynthesisPayloadInput {
  previousState: StateSnapshot;
  transaction: TxSnapshot;
  blockInfo: BlockInfo;
  contractCodes: ContractCodeEntry[];
}

export interface SynthesisInput extends SynthesisPayloadInput {
  subcircuitLibrary: ResolvedSubcircuitLibrary;
  wasmBuffers: ArrayBuffer[];
}

export interface SynthesisOutput extends CircuitArtifacts {
  finalStateSnapshot: StateSnapshot;
  evmAnalysis: {
    stepLogs: SynthesizerInterface['stepLogs'];
    messageCodeAddresses: string[];
  };
}
