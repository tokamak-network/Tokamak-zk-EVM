import { createSynthesisOutputJsonFiles, type SynthesisOutput } from '../../core/src/index.ts';

export function createSynthesisOutputBlobs(output: SynthesisOutput): Record<string, Blob> {
  return Object.fromEntries(
    Object.entries(createSynthesisOutputJsonFiles(output)).map(([fileName, jsonContent]) => [
      fileName,
      new Blob([jsonContent], { type: 'application/json' }),
    ]),
  );
}

export function createSynthesisOutputPayload(output: SynthesisOutput): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(createSynthesisOutputJsonFiles(output)).map(([fileName, jsonContent]) => [
      fileName,
      JSON.parse(jsonContent) as unknown,
    ]),
  );
}

export function saveSynthesisOutputToFiles(output: SynthesisOutput): void {
  if (typeof document === 'undefined') {
    throw new Error('saveSynthesisOutputToFiles requires a browser document');
  }

  for (const [fileName, blob] of Object.entries(createSynthesisOutputBlobs(output))) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

export async function postSynthesisOutput(
  url: string,
  output: SynthesisOutput,
  init?: Omit<RequestInit, 'body' | 'method'> & { method?: 'POST' | 'PUT' | 'PATCH' },
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return fetchImpl(url, {
    ...init,
    method: init?.method ?? 'POST',
    headers,
    body: JSON.stringify(createSynthesisOutputPayload(output)),
  });
}
