import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import { logVerbose } from '../system.js';

interface ResumableDownloadState {
  archiveName: string;
  contentLength: number;
  fileId: string;
}

interface DownloadRequestDefinition {
  headers?: Record<string, string>;
  url: string;
}

const CRS_DOWNLOAD_CHUNK_SIZE = 512 * 1024 * 1024;

const CRS_DOWNLOAD_RETRY_BASE_DELAY_MS = 1_000;

const DOWNLOAD_PROGRESS_LOG_INTERVAL_MS = 2_000;

const DOWNLOAD_PROGRESS_PERCENT_STEP = 5;

let activeDownloadProgressLength = 0;

function flushActiveDownloadProgressLine(): void {
  if (activeDownloadProgressLength === 0) {
    return;
  }
  process.stderr.write('\n');
  activeDownloadProgressLength = 0;
}

function writeStderrLine(message: string): void {
  flushActiveDownloadProgressLine();
  console.error(message);
}

function logDownloadProgress(message: string, done = false): void {
  const line = `[download] ${message}`;
  if (!process.stderr.isTTY) {
    writeStderrLine(line);
    return;
  }

  const renderedLine = line.padEnd(activeDownloadProgressLength, ' ');
  if (done) {
    process.stderr.write(`\r${renderedLine}\n`);
    activeDownloadProgressLength = 0;
    return;
  }

  process.stderr.write(`\r${renderedLine}`);
  activeDownloadProgressLength = renderedLine.length;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileSizeIfExists(target: string): Promise<number | null> {
  try {
    const stat = await fs.stat(target);
    return stat.size;
  } catch {
    return null;
  }
}

export async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function sha256FileHex(filePath: string): Promise<string> {
  const hasher = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fsSync.createReadStream(filePath);
    stream.on('data', (chunk: Buffer | string) => {
      hasher.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hasher.digest('hex');
}

export function normalizeSha256(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null;
}

export async function downloadFile(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  if (response.body === null) {
    throw new Error(`Download response did not contain a body: ${url}`);
  }
  await ensureDir(path.dirname(destinationPath));
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  await streamDownloadToFile(response, destinationPath, {
    label: path.basename(destinationPath),
    totalBytes: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null,
  });
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = value >= 100 || index === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function formatDownloadProgress(
  label: string,
  downloadedBytes: number,
  totalBytes: number | null,
  done: boolean,
): string {
  if (totalBytes !== null && totalBytes > 0) {
    const percent = Math.min((downloadedBytes / totalBytes) * 100, 100);
    const verb = done ? 'Completed' : 'Downloading';
    return `${verb} ${label}: ${percent.toFixed(1)}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`;
  }
  const verb = done ? 'Completed' : 'Downloading';
  return `${verb} ${label}: ${formatBytes(downloadedBytes)}`;
}

export async function streamDownloadToFile(
  response: Response,
  destinationPath: string,
  options: {
    append?: boolean;
    finalizeProgress?: boolean;
    initialBytes?: number;
    label: string;
    totalBytes: number | null;
  },
): Promise<void> {
  if (response.body === null) {
    throw new Error('Download response did not contain a body.');
  }

  const {
    append = false,
    finalizeProgress = true,
    initialBytes = 0,
    label,
    totalBytes,
  } = options;
  const file = await fs.open(destinationPath, append ? 'a' : 'w');
  let downloadedBytes = initialBytes;
  let lastLoggedAt = 0;
  let lastLoggedPercentStep = totalBytes !== null && totalBytes > 0
    ? Math.floor((downloadedBytes / totalBytes) * 100 / DOWNLOAD_PROGRESS_PERCENT_STEP)
    : -1;

  logDownloadProgress(formatDownloadProgress(label, downloadedBytes, totalBytes, false));
  try {
    for await (const value of response.body) {
      await file.writeFile(value);
      downloadedBytes += value.byteLength;

      const now = Date.now();
      const currentPercentStep = totalBytes !== null && totalBytes > 0
        ? Math.floor((downloadedBytes / totalBytes) * 100 / DOWNLOAD_PROGRESS_PERCENT_STEP)
        : -1;
      const shouldLog =
        now - lastLoggedAt >= DOWNLOAD_PROGRESS_LOG_INTERVAL_MS ||
        (totalBytes !== null && currentPercentStep > lastLoggedPercentStep);
      if (shouldLog) {
        logDownloadProgress(formatDownloadProgress(label, downloadedBytes, totalBytes, false));
        lastLoggedAt = now;
        lastLoggedPercentStep = currentPercentStep;
      }
    }
  } catch (error) {
    flushActiveDownloadProgressLine();
    throw error;
  } finally {
    await file.close();
  }

  if (finalizeProgress) {
    logDownloadProgress(formatDownloadProgress(label, downloadedBytes, totalBytes, true), true);
  }
}

function resumableDownloadStatePath(partialPath: string): string {
  return `${partialPath}.json`;
}

async function readResumableDownloadState(partialPath: string): Promise<ResumableDownloadState | null> {
  try {
    const contents = await fs.readFile(resumableDownloadStatePath(partialPath), 'utf8');
    return JSON.parse(contents) as ResumableDownloadState;
  } catch {
    return null;
  }
}

async function writeResumableDownloadState(partialPath: string, state: ResumableDownloadState): Promise<void> {
  await fs.writeFile(resumableDownloadStatePath(partialPath), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function removeResumableDownloadArtifacts(partialPath: string): Promise<void> {
  await fs.rm(partialPath, { force: true });
  await fs.rm(resumableDownloadStatePath(partialPath), { force: true });
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function matchesResumableDownloadState(
  state: ResumableDownloadState | null,
  expected: ResumableDownloadState,
): state is ResumableDownloadState {
  return (
    state !== null &&
    state.archiveName === expected.archiveName &&
    state.fileId === expected.fileId &&
    state.contentLength === expected.contentLength
  );
}

async function finalizeResumableDownload(
  partialPath: string,
  destinationPath: string,
  expectedLength: number,
): Promise<void> {
  const finalSize = await fileSizeIfExists(partialPath);
  if (finalSize !== expectedLength) {
    throw new Error(
      `Download finished with ${finalSize ?? 0} bytes, but ${expectedLength} bytes were expected.`,
    );
  }
  await fs.rename(partialPath, destinationPath);
  await fs.rm(resumableDownloadStatePath(partialPath), { force: true });
}

function isCrsDownloadResponse(response: Response): boolean {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const contentDisposition = (response.headers.get('content-disposition') ?? '').toLowerCase();
  return (
    contentDisposition.includes('attachment') ||
    contentType.includes('application/octet-stream') ||
    contentType.split(';')[0].trim() === 'application/json' ||
    contentType.includes('application/zip') ||
    contentType.includes('application/x-zip-compressed')
  );
}

export async function downloadFileWithResume(
  destinationPath: string,
  state: ResumableDownloadState,
  verbose: boolean,
  options: {
    describe: string;
    maxRetries: number;
    request: (offset: number, chunkEnd: number) => Promise<DownloadRequestDefinition> | DownloadRequestDefinition;
  },
): Promise<void> {
  const partialPath = `${destinationPath}.part`;
  const existingState = await readResumableDownloadState(partialPath);
  if (!matchesResumableDownloadState(existingState, state)) {
    await removeResumableDownloadArtifacts(partialPath);
  }

  await ensureDir(path.dirname(destinationPath));
  await writeResumableDownloadState(partialPath, state);

  let consecutiveFailures = 0;
  while (true) {
    const offset = (await fileSizeIfExists(partialPath)) ?? 0;
    if (offset > state.contentLength) {
      await removeResumableDownloadArtifacts(partialPath);
      await writeResumableDownloadState(partialPath, state);
      continue;
    }
    if (offset === state.contentLength) {
      await finalizeResumableDownload(partialPath, destinationPath, state.contentLength);
      return;
    }

    const chunkEnd = Math.min(offset + CRS_DOWNLOAD_CHUNK_SIZE - 1, state.contentLength - 1);
    logVerbose(
      verbose,
      `${options.describe}: downloading CRS bytes ${offset}-${chunkEnd} of ${state.contentLength} (${state.archiveName})`,
    );

    try {
      const request = await options.request(offset, chunkEnd);
      const response = await fetch(request.url, {
        headers: request.headers,
      });
      if (!response.ok) {
        throw new Error(`Failed to download ${request.url}: ${response.status} ${response.statusText}`);
      }
      if (response.body === null) {
        throw new Error(`Download response did not contain a body: ${request.url}`);
      }
      if (!isCrsDownloadResponse(response)) {
        throw new Error(
          `Expected a CRS file download response, received status ${response.status} with content-type ${response.headers.get('content-type') ?? '<missing>'}.`,
        );
      }
      if (response.status !== 206) {
        throw new Error(`Expected HTTP 206 for CRS chunk download, received ${response.status}`);
      }

      const contentRange = response.headers.get('content-range');
      const expectedRangePrefix = `bytes ${offset}-`;
      if (!contentRange?.startsWith(expectedRangePrefix)) {
        throw new Error(`Resume response started at an unexpected offset: ${contentRange ?? '<missing>'}`);
      }

      await streamDownloadToFile(response, partialPath, {
        append: offset > 0,
        finalizeProgress: chunkEnd + 1 === state.contentLength,
        initialBytes: offset,
        label: state.archiveName,
        totalBytes: state.contentLength,
      });

      const currentSize = await fileSizeIfExists(partialPath);
      const expectedSize = chunkEnd + 1;
      if (currentSize !== expectedSize) {
        throw new Error(
          `CRS chunk write ended at ${currentSize ?? 0} bytes, but ${expectedSize} bytes were expected after this chunk.`,
        );
      }
      consecutiveFailures = 0;
      if (currentSize === state.contentLength) {
        await finalizeResumableDownload(partialPath, destinationPath, state.contentLength);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentSize = (await fileSizeIfExists(partialPath)) ?? 0;
      consecutiveFailures += 1;
      if (consecutiveFailures >= options.maxRetries) {
        throw new Error(
          `${options.describe} failed after ${consecutiveFailures} consecutive attempts at ${currentSize} of ${state.contentLength} bytes: ${message}`,
        );
      }
      const delayMs = CRS_DOWNLOAD_RETRY_BASE_DELAY_MS * 2 ** (consecutiveFailures - 1);
      logVerbose(
        verbose,
        `${options.describe} attempt ${consecutiveFailures} failed at ${currentSize} of ${state.contentLength} bytes: ${message}. Retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }
}
