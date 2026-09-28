import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface StagedRuntimePath {
  readonly activePath: string;
  readonly stagingPath: string;
}

/** Promotes complete staged runtime paths and restores every prior path on failure. */
export async function promoteStagedRuntimePaths(paths: readonly StagedRuntimePath[]): Promise<void> {
  validatePaths(paths);
  const states = paths.map((entry) => ({
    ...entry,
    backupPath: path.join(path.dirname(entry.activePath), `.${path.basename(entry.activePath)}-backup-${randomUUID()}`),
    activeBackedUp: false,
    stagingActivated: false,
  }));
  try {
    for (const entry of states) {
      await fs.mkdir(path.dirname(entry.activePath), { recursive: true });
      if (await exists(entry.activePath)) {
        await fs.rename(entry.activePath, entry.backupPath);
        entry.activeBackedUp = true;
      }
      await fs.rename(entry.stagingPath, entry.activePath);
      entry.stagingActivated = true;
    }
  } catch (error) {
    const failures: string[] = [];
    for (const entry of [...states].reverse()) {
      if (entry.stagingActivated) {
        await recordFailure(failures, `remove new path ${entry.activePath}`, async () => {
          await fs.rename(entry.activePath, entry.stagingPath);
        });
      }
      if (entry.activeBackedUp) {
        await recordFailure(failures, `restore previous path ${entry.activePath}`, async () => {
          await fs.rename(entry.backupPath, entry.activePath);
        });
      }
    }
    if (failures.length > 0) {
      throw new Error(`Runtime stage promotion failed: ${message(error)}. Rollback also failed: ${failures.join('; ')}`);
    }
    throw error;
  }
  for (const entry of states) {
    await fs.rm(entry.backupPath, { recursive: true, force: true });
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function validatePaths(paths: readonly StagedRuntimePath[]): void {
  if (paths.length === 0) {
    throw new Error('Runtime stage promotion requires at least one staged path.');
  }
  const activePaths = new Set<string>();
  const stagingPaths = new Set<string>();
  for (const entry of paths) {
    if (entry.activePath === entry.stagingPath) {
      throw new Error(`Runtime stage path must use distinct active and staging paths: ${entry.activePath}`);
    }
    if (activePaths.has(entry.activePath) || stagingPaths.has(entry.stagingPath)) {
      throw new Error('Runtime stage promotion paths must be unique.');
    }
    activePaths.add(entry.activePath);
    stagingPaths.add(entry.stagingPath);
  }
}

async function recordFailure(failures: string[], operation: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    failures.push(`${operation}: ${message(error)}`);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
