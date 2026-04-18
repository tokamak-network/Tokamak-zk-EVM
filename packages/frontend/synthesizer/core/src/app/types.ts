import type { StateSnapshot, TxSnapshot } from 'tokamak-l2js';
import type { CircuitArtifacts } from '../circuitGenerator/types/types.ts';
import type { ResolvedSubcircuitLibrary } from '../interface/qapCompiler/libraryTypes.ts';
import type { SynthesizerBlockInfo } from '../interface/rpc/types.ts';
import type { SynthesizerInterface } from '../synthesizer/types/index.ts';

export type ContractCodeEntry = {
  address: string;
  code: string;
};

export interface SynthesisPayloadInput {
  previousState: StateSnapshot;
  transaction: TxSnapshot;
  blockInfo: SynthesizerBlockInfo;
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
