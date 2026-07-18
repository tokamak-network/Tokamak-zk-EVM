import {
  createSynthesisOutputJsonFiles,
  type SynthesisOutput,
  type SynthesisOutputSelectionOptions,
} from '../../../core/src/app.ts';

export type WebSynthesisOutputOptions = SynthesisOutputSelectionOptions;

function toDownloadFileName(logicalPath: string): string {
  return logicalPath.replace(/\//gu, '__');
}

export function createSynthesisOutputBlobs(
  output: SynthesisOutput,
  options: WebSynthesisOutputOptions = {},
): Record<string, Blob> {
  return Object.fromEntries(
    Object.entries(createSynthesisOutputJsonFiles(output, options)).map(([fileName, jsonContent]) => [
      fileName,
      new Blob([jsonContent], { type: 'application/json' }),
    ]),
  );
}

export function createSynthesisOutputPayload(
  output: SynthesisOutput,
  options: WebSynthesisOutputOptions = {},
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(createSynthesisOutputJsonFiles(output, options)).map(([fileName, jsonContent]) => [
      fileName,
      JSON.parse(jsonContent) as unknown,
    ]),
  );
}

export function saveSynthesisOutputToFiles(
  output: SynthesisOutput,
  options: WebSynthesisOutputOptions = {},
): void {
  if (typeof document === 'undefined') {
    throw new Error('saveSynthesisOutputToFiles requires a browser document');
  }

  for (const [fileName, blob] of Object.entries(createSynthesisOutputBlobs(output, options))) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = toDownloadFileName(fileName);
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

export async function postSynthesisOutput(
  url: string,
  output: SynthesisOutput,
  init?: Omit<RequestInit, 'body' | 'method'> & { method?: 'POST' | 'PUT' | 'PATCH' },
  fetchOrOptions: typeof fetch | WebSynthesisOutputOptions = fetch,
  options: WebSynthesisOutputOptions = {},
): Promise<Response> {
  const fetchImpl = typeof fetchOrOptions === 'function' ? fetchOrOptions : fetch;
  const outputOptions = typeof fetchOrOptions === 'function' ? options : fetchOrOptions;
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return fetchImpl(url, {
    ...init,
    method: init?.method ?? 'POST',
    headers,
    body: JSON.stringify(createSynthesisOutputPayload(output, outputOptions)),
  });
}
