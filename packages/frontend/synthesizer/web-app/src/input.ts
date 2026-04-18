import type { SynthesisPayloadInput } from '../../core/src/index.ts';
import type { SynthesisInputFiles, SynthesisInputUrls } from './types.ts';

export async function loadJsonFromBlob<T>(blob: Blob): Promise<T> {
  return JSON.parse(await blob.text()) as T;
}

export async function loadJsonFromUrl<T>(
  url: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new Error(`Failed to load JSON from ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function loadSynthesisInputFromFiles(
  files: SynthesisInputFiles,
): Promise<SynthesisPayloadInput> {
  const [previousState, transaction, blockInfo, contractCodes] = await Promise.all([
    loadJsonFromBlob<SynthesisPayloadInput['previousState']>(files.previousState),
    loadJsonFromBlob<SynthesisPayloadInput['transaction']>(files.transaction),
    loadJsonFromBlob<SynthesisPayloadInput['blockInfo']>(files.blockInfo),
    loadJsonFromBlob<SynthesisPayloadInput['contractCodes']>(files.contractCodes),
  ]);

  return {
    previousState,
    transaction,
    blockInfo,
    contractCodes,
  };
}

export async function loadSynthesisInputFromUrls(
  urls: SynthesisInputUrls,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<SynthesisPayloadInput> {
  const [previousState, transaction, blockInfo, contractCodes] = await Promise.all([
    loadJsonFromUrl<SynthesisPayloadInput['previousState']>(urls.previousState, init, fetchImpl),
    loadJsonFromUrl<SynthesisPayloadInput['transaction']>(urls.transaction, init, fetchImpl),
    loadJsonFromUrl<SynthesisPayloadInput['blockInfo']>(urls.blockInfo, init, fetchImpl),
    loadJsonFromUrl<SynthesisPayloadInput['contractCodes']>(urls.contractCodes, init, fetchImpl),
  ]);

  return {
    previousState,
    transaction,
    blockInfo,
    contractCodes,
  };
}
