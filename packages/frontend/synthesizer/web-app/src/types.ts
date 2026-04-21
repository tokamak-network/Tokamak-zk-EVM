import type {
  SynthesisOutput,
  SynthesisPayloadInput,
} from '../../core/src/app.ts';

export type WebAppInput = SynthesisPayloadInput;
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
