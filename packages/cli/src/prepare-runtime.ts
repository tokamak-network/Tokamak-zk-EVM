import fs from 'node:fs/promises';
import path from 'node:path';
import { activateManagedPrerequisiteEnvironment, detectSupportedNativeOs } from './prerequisites.js';
import { createRuntimeContext, prepareNativeRuntime } from './runtime.js';
import type { InstallOptions, RuntimeContext } from './runtime/model.js';

interface WorkerArguments {
  readonly noFullSetup: boolean;
  readonly stagingRoot: string;
  readonly verbose: boolean;
}

async function main(): Promise<void> {
  const workerArgs = parseArguments(process.argv.slice(2));
  activateManagedPrerequisiteEnvironment();
  const context = await createRuntimeContext();
  const stagingRoot = requireStagingRoot(context, workerArgs.stagingRoot);
  await assertEmptyStagingRoot(stagingRoot);
  const nativeOs = await detectSupportedNativeOs();
  const stagingContext: RuntimeContext = {
    ...context,
    runtimeDir: path.join(stagingRoot, 'runtime'),
  };
  const options: InstallOptions = {
    docker: false,
    includePrerequisite: false,
    noFullSetup: workerArgs.noFullSetup,
    verbose: workerArgs.verbose,
  };
  const backendRuntimeIdentity = await prepareNativeRuntime(context, nativeOs, options, stagingContext);
  await fs.writeFile(
    path.join(stagingRoot, 'backend-runtime-identity.json'),
    `${JSON.stringify(backendRuntimeIdentity, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );
}

function parseArguments(argv: readonly string[]): WorkerArguments {
  let noFullSetup = false;
  let stagingRoot: string | undefined;
  let verbose = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--no-full-setup') {
      noFullSetup = true;
      continue;
    }
    if (argument === '--verbose') {
      verbose = true;
      continue;
    }
    if (argument === '--staging-root') {
      if (stagingRoot !== undefined || index + 1 >= argv.length) {
        throw new Error('The runtime preparation worker requires exactly one --staging-root path.');
      }
      stagingRoot = argv[index + 1]!;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported runtime preparation worker argument: ${argument}`);
  }
  if (stagingRoot === undefined) {
    throw new Error('The runtime preparation worker requires --staging-root.');
  }
  return { noFullSetup, stagingRoot, verbose };
}

function requireStagingRoot(context: RuntimeContext, value: string): string {
  const stagingRoot = path.resolve(value);
  const relative = path.relative(context.platformDir, stagingRoot);
  if (
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Runtime preparation staging root must be a child of ${context.platformDir}.`);
  }
  return stagingRoot;
}

async function assertEmptyStagingRoot(stagingRoot: string): Promise<void> {
  const stat = await fs.lstat(stagingRoot).catch(() => null);
  if (stat === null || !stat.isDirectory()) {
    throw new Error(`Runtime preparation staging root is not an existing directory: ${stagingRoot}`);
  }
  const entries = await fs.readdir(stagingRoot);
  if (entries.length !== 0) {
    throw new Error(`Runtime preparation staging root must be empty: ${stagingRoot}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
