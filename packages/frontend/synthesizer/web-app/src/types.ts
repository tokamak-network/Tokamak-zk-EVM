import type {
  SynthesisInput,
  SynthesisOutput,
  SynthesisPayloadInput,
} from '../../core/src/index.ts';

export type WebAppInput = SynthesisInput;
export type WebAppOutput = SynthesisOutput;
export type WebAppPayloadInput = SynthesisPayloadInput;

export interface SynthesisInputFiles {
  previousState: Blob;
  transaction: Blob;
  blockInfo: Blob;
  contractCodes: Blob;
}

export interface SynthesisInputUrls {
  previousState: string;
  transaction: string;
  blockInfo: string;
  contractCodes: string;
}

export interface SubcircuitLibraryFiles {
  setupParams: Blob;
  globalWireList: Blob;
  frontendCfg: Blob;
  subcircuitInfo: Blob;
  wasmFiles: Record<number, Blob>;
}

export interface FetchSubcircuitLibrarySource {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}
