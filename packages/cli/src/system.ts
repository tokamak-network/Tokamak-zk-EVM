import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
/** Captured output from a completed child process. */
export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandProbe {
  exists(command: string): boolean;
  version(command: string, args: readonly string[]): string | null;
}

export function logVerbose(enabled: boolean, message: string): void {
  if (enabled) {
    console.error(`[info] ${message}`);
  }
}

function isExecutableFile(target: string, platform: NodeJS.Platform): boolean {
  try {
    const mode = platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK;
    fs.accessSync(target, mode);
    return true;
  } catch {
    return false;
  }
}

export function commandExists(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (command.includes(path.sep)) {
    return isExecutableFile(command, platform);
  }
  const names = platform !== 'win32' || path.extname(command)
    ? [command]
    : [
        command,
        ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .map((extension) => extension.trim())
          .filter((extension) => extension.length > 0)
          .map((extension) => `${command}${extension.toLowerCase()}`),
      ];
  return (env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .some((entry) => names.some((name) => isExecutableFile(path.join(entry, name), platform)));
}

export function createSystemCommandProbe(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): CommandProbe {
  return {
    exists(command: string): boolean {
      return commandExists(command, env, platform);
    },
    version(command: string, args: readonly string[]): string | null {
      const result = spawnSync(command, [...args], {
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (result.error || result.status !== 0) {
        return null;
      }
      return `${result.stdout}\n${result.stderr}`
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? null;
    },
  };
}

export async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    quiet?: boolean;
    suppressStdout?: boolean;
    verbose?: boolean;
  } = {},
): Promise<CommandResult> {
  const { cwd, env, quiet = false, suppressStdout = false, verbose = false } = options;
  logVerbose(verbose, `Command: ${command} ${args.join(' ')}`);
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      if (!quiet && !suppressStdout) {
        process.stdout.write(text);
      }
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      if (!quiet) {
        process.stderr.write(text);
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

export async function commandSucceeds(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    verbose?: boolean;
  } = {},
): Promise<boolean> {
  try {
    await runCommand(command, args, { ...options, quiet: true });
    return true;
  } catch {
    return false;
  }
}
