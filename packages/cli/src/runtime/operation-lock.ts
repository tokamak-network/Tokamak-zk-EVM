import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ensureDir } from './context.js';
import type { RuntimeContext } from './model.js';

interface LockOwner {
  readonly operation: string;
  readonly pid: number;
  readonly token: string;
}

export interface RuntimeOperationLock {
  release(): Promise<void>;
}

/** Acquires the sole live operation slot for one runtime installation workspace. */
export async function acquireRuntimeOperationLock(
  context: RuntimeContext,
  operation: string,
): Promise<RuntimeOperationLock> {
  await ensureDir(context.platformDir);
  const endpoint = operationLockEndpoint(context);
  const owner: LockOwner = { operation, pid: process.pid, token: randomUUID() };
  const server = net.createServer(socket => {
    socket.end(`${JSON.stringify(owner)}\n`);
  });

  await listenOrReportBusy(server, endpoint, context);
  let released = false;
  const removeEndpointOnExit = (): void => {
    if (process.platform !== 'win32') {
      try {
        fs.rmSync(endpoint, { force: true });
      } catch {
        // Process exit cannot report cleanup failures. The next acquisition
        // verifies endpoint liveness before it removes an inactive socket.
      }
    }
  };
  process.once('exit', removeEndpointOnExit);

  return {
    async release(): Promise<void> {
      if (released) {
        return;
      }
      released = true;
      process.removeListener('exit', removeEndpointOnExit);
      await new Promise<void>((resolve, reject) => {
        server.close(error => error === undefined ? resolve() : reject(error));
      });
      if (process.platform !== 'win32') {
        await fsPromises.rm(endpoint, { force: true });
      }
    },
  };
}

function operationLockEndpoint(context: RuntimeContext): string {
  if (process.platform !== 'win32') {
    const digest = createHash('sha256').update(context.platformDir).digest('hex');
    return path.join(os.tmpdir(), `tokamak-zkevm-${digest.slice(0, 20)}.sock`);
  }
  const digest = createHash('sha256').update(context.platformDir).digest('hex');
  return `\\\\.\\pipe\\tokamak-zkevm-runtime-${digest}`;
}

async function listenOrReportBusy(
  server: net.Server,
  endpoint: string,
  context: RuntimeContext,
): Promise<void> {
  try {
    await listen(server, endpoint);
  } catch (error) {
    if (!isAddressInUse(error)) {
      throw error;
    }
    const activeOwner = await readLiveLockOwner(endpoint);
    if (activeOwner !== null && activeOwner !== 'unavailable') {
      throw new Error(
        `Tokamak zk-EVM runtime workspace ${context.platformDir} is busy with ${activeOwner.operation} (pid ${activeOwner.pid}). Wait for that command to finish or terminate its process before retrying.`,
      );
    }
    if (activeOwner === 'unavailable') {
      throw new Error(
        `Tokamak zk-EVM runtime workspace ${context.platformDir} lock endpoint is occupied by an unrecognized live service. Resolve that endpoint before retrying.`,
      );
    }
    if (process.platform === 'win32') {
      throw new Error(
        `Tokamak zk-EVM runtime workspace ${context.platformDir} lock endpoint is unavailable. Terminate the owning process before retrying.`,
      );
    }
    await fsPromises.rm(endpoint, { force: true });
    await listen(server, endpoint);
  }
}

function listen(server: net.Server, endpoint: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(endpoint);
  });
}

async function readLiveLockOwner(endpoint: string): Promise<LockOwner | 'unavailable' | null> {
  return await new Promise(resolve => {
    const socket = net.createConnection(endpoint);
    let received = '';
    socket.setTimeout(500);
    socket.on('data', chunk => {
      received += chunk.toString();
    });
    socket.on('end', () => {
      try {
        const value = JSON.parse(received) as Partial<LockOwner>;
        const pid = value.pid;
        if (typeof value.operation === 'string' && typeof pid === 'number' && Number.isInteger(pid) && typeof value.token === 'string') {
          resolve({ operation: value.operation, pid, token: value.token });
          return;
        }
      } catch {
        // A non-conforming response does not prove that the endpoint is an
        // inactive lock, so keep it unavailable.
      }
      resolve('unavailable');
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    socket.on('error', () => resolve(null));
  });
}

function isAddressInUse(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE';
}
