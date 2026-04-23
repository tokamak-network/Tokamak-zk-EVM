#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  runTokamakChannelTxFromFiles,
  type TokamakChannelTxFiles,
} from '@tokamak-zk-evm/synthesizer-node';
import {
  detectPlatform,
  installRuntime,
  requireInstalledRuntime,
  runBackendCommand,
  runCommand,
  runtimePaths,
  uninstallRuntime,
  type RuntimeContext,
} from './runtime.js';

type CommandName =
  | 'install'
  | 'uninstall'
  | 'synthesize'
  | 'preprocess'
  | 'prove'
  | 'verify'
  | 'extract-proof'
  | 'doctor';

interface ParsedArgs {
  command: CommandName;
  verbose: boolean;
  installOptions?: {
    docker: boolean;
    trustedSetup: boolean;
    noSetup: boolean;
  };
  synthesizeArgs?: string[];
  arg1?: string;
}

function printUsage(): void {
  console.log(`
Commands:
  --install [--trusted-setup] [--no-setup] [--docker]
      Build the local Tokamak zk-EVM runtime from the packaged backend workspace and prepare local resources
      By default setup artifacts are installed from the published CRS archive
      Use --trusted-setup to generate setup artifacts locally with the trusted-setup binary
      Use --no-setup to skip setup artifact provisioning
      Use --docker on Linux or macOS to install and run backend commands through an Ubuntu 22 container

  --uninstall
      Remove the local Tokamak zk-EVM workspace for the current platform, including cached runtime files and downloads

  --synthesize <INPUT_DIR|OPTIONS...>
      Execute TokamakL2JS Channel transaction using the synthesizer-node API
      Supported inputs:
        <INPUT_DIR>      Directory containing previous_state_snapshot.json, transaction.json, block_info.json, and contract_codes.json
      Or provide:
        --previous-state  Path to previous state snapshot JSON
        --transaction     Path to transaction snapshot JSON
        --block-info      Path to block information JSON
        --contract-code   Path to contract code JSON

  --preprocess [<SYNTH_OUTPUT_ZIP|DIR>]
      Run backend preprocess stage
      If an input directory or zip is provided, it must include permutation.json and instance.json

  --prove [<SYNTH_OUTPUT_ZIP|DIR>]
      Run backend prove stage
      If an input directory or zip is provided, it must include placementVariables.json, permutation.json, and instance.json

  --verify [<PROOF_ZIP|DIR>]
      Verify a proof saved under the installed runtime
      If an input directory or zip is provided, it must include proof.json, preprocess.json, and instance.json

  --extract-proof <OUTPUT_ZIP_PATH>
      Collect proof artifacts from the installed runtime and zip them to the given path

  --doctor
      Check package and runtime health

  --help
      Show this help

Options:
  --verbose        Show detailed output
  --trusted-setup  Build setup artifacts locally during --install
  --no-setup       Skip setup artifact provisioning during --install
  --docker         Install through Docker on Linux or macOS and save a Docker bootstrap
`);
}

function err(message: string): never {
  throw new Error(message);
}

function resolveUserPath(input: string): string {
  return path.resolve(process.cwd(), input);
}

async function ensureFile(target: string): Promise<void> {
  await fs.access(target);
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function emptyDir(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
}

async function copyRequiredNamedFilesFromDir(
  sourceDir: string,
  destinationDir: string,
  filenames: string[],
): Promise<void> {
  await fs.mkdir(destinationDir, { recursive: true });
  for (const filename of filenames) {
    const sourcePath = path.join(sourceDir, filename);
    if (!(await fileExists(sourcePath))) {
      err(`Missing ${filename} under ${sourceDir}`);
    }
    await fs.copyFile(sourcePath, path.join(destinationDir, filename));
  }
}

async function copyOptionalNamedFilesFromDir(
  sourceDir: string,
  destinationDir: string,
  filenames: string[],
): Promise<void> {
  await fs.mkdir(destinationDir, { recursive: true });
  for (const filename of filenames) {
    const sourcePath = path.join(sourceDir, filename);
    if (await fileExists(sourcePath)) {
      await fs.copyFile(sourcePath, path.join(destinationDir, filename));
    }
  }
}

async function extractZipToTemp(zipPath: string, prefix: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  await runCommand('unzip', ['-q', zipPath, '-d', tmpDir]);
  return tmpDir;
}

async function withDirFromPath<T>(
  inputPath: string,
  prefix: string,
  handler: (dirPath: string) => Promise<T>,
): Promise<T> {
  const resolved = resolveUserPath(inputPath);
  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) {
    return await handler(resolved);
  }
  if (stat.isFile()) {
    const tmpDir = await extractZipToTemp(resolved, prefix);
    try {
      return await handler(tmpDir);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
  err(`Path not found: ${inputPath}`);
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const verbose = argv.includes('--verbose');

  if (argv[0] === '--install') {
    let docker = false;
    let trustedSetup = false;
    let noSetup = false;
    for (const arg of argv.slice(1)) {
      if (arg === '--verbose') continue;
      if (arg === '--docker') {
        docker = true;
        continue;
      }
      if (arg === '--trusted-setup') {
        trustedSetup = true;
        continue;
      }
      if (arg === '--no-setup') {
        noSetup = true;
        continue;
      }
      err(`Unknown option for --install: ${arg}`);
    }
    if (trustedSetup && noSetup) {
      err('--trusted-setup cannot be combined with --no-setup');
    }
    return {
      command: 'install',
      verbose,
      installOptions: { docker, trustedSetup, noSetup },
    };
  }
  if (argv[0] === '--uninstall') {
    for (const arg of argv.slice(1)) {
      if (arg === '--verbose') continue;
      err(`Unknown option for --uninstall: ${arg}`);
    }
    return { command: 'uninstall', verbose };
  }

  if (argv[0] === '--synthesize') {
    return {
      command: 'synthesize',
      verbose,
      synthesizeArgs: argv.slice(1).filter((arg) => arg !== '--verbose'),
    };
  }

  if (argv[0] === '--preprocess') {
    return { command: 'preprocess', verbose, arg1: argv[1] };
  }
  if (argv[0] === '--prove') {
    return { command: 'prove', verbose, arg1: argv[1] };
  }
  if (argv[0] === '--verify') {
    return { command: 'verify', verbose, arg1: argv[1] };
  }
  if (argv[0] === '--extract-proof') {
    const outputPath = argv[1];
    if (!outputPath) {
      err('--extract-proof requires <OUTPUT_ZIP_PATH>');
    }
    return { command: 'extract-proof', verbose, arg1: outputPath };
  }
  if (argv[0] === '--doctor') {
    return { command: 'doctor', verbose };
  }

  err(`Unknown option: ${argv[0]}`);
}

function log(message: string): void {
  console.log(`\x1b[1;34m[tokamak-cli]\x1b[0m ${message}`);
}

function ok(message: string): void {
  console.log(`\x1b[1;32m[ ok ]\x1b[0m ${message}`);
}

function info(verbose: boolean, message: string): void {
  if (verbose) {
    console.error(`\x1b[1;36m[info]\x1b[0m ${message}`);
  }
}

function normalizeSynthesizeArgs(args: string[]): TokamakChannelTxFiles {
  if (args.length === 1 && !args[0].startsWith('-')) {
    const inputDir = resolveUserPath(args[0]);
    return {
      previousState: path.join(inputDir, 'previous_state_snapshot.json'),
      transaction: path.join(inputDir, 'transaction.json'),
      blockInfo: path.join(inputDir, 'block_info.json'),
      contractCode: path.join(inputDir, 'contract_codes.json'),
    };
  }

  const parsed: Partial<TokamakChannelTxFiles> = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];
    switch (current) {
      case '--previous-state':
        if (!next) err('--previous-state requires a path');
        parsed.previousState = resolveUserPath(next);
        index += 1;
        break;
      case '--transaction':
        if (!next) err('--transaction requires a path');
        parsed.transaction = resolveUserPath(next);
        index += 1;
        break;
      case '--block-info':
        if (!next) err('--block-info requires a path');
        parsed.blockInfo = resolveUserPath(next);
        index += 1;
        break;
      case '--contract-code':
        if (!next) err('--contract-code requires a path');
        parsed.contractCode = resolveUserPath(next);
        index += 1;
        break;
      default:
        err(`Unknown synthesize argument: ${current}`);
    }
  }

  if (!parsed.previousState || !parsed.transaction || !parsed.blockInfo || !parsed.contractCode) {
    err('--synthesize requires <INPUT_DIR> or the full set of file options');
  }
  return parsed as TokamakChannelTxFiles;
}

async function syncPreprocessInputs(context: RuntimeContext, inputPath: string): Promise<void> {
  const paths = runtimePaths(context);
  await withDirFromPath(inputPath, 'tokamak-preprocess', async (dirPath) => {
    await copyRequiredNamedFilesFromDir(dirPath, paths.synthOutputDir, [
      'permutation.json',
      'instance.json',
    ]);
  });
}

async function syncProveInputs(context: RuntimeContext, inputPath: string): Promise<void> {
  const paths = runtimePaths(context);
  await withDirFromPath(inputPath, 'tokamak-prove', async (dirPath) => {
    await copyRequiredNamedFilesFromDir(dirPath, paths.synthOutputDir, [
      'instance.json',
      'permutation.json',
      'placementVariables.json',
    ]);
    await copyOptionalNamedFilesFromDir(dirPath, paths.synthOutputDir, [
      'instance_description.json',
      'state_snapshot.json',
    ]);
  });
}

async function syncVerifyInputs(context: RuntimeContext, inputPath: string): Promise<void> {
  const paths = runtimePaths(context);
  await withDirFromPath(inputPath, 'tokamak-verify', async (dirPath) => {
    await fs.mkdir(paths.proveOutputDir, { recursive: true });
    await fs.mkdir(paths.preprocessOutputDir, { recursive: true });
    await fs.mkdir(paths.synthOutputDir, { recursive: true });
    await copyRequiredNamedFilesFromDir(dirPath, paths.proveOutputDir, ['proof.json']);
    await copyRequiredNamedFilesFromDir(dirPath, paths.preprocessOutputDir, ['preprocess.json']);
    await copyRequiredNamedFilesFromDir(dirPath, paths.synthOutputDir, ['instance.json']);
  });
}

async function runPreprocess(context: RuntimeContext, inputPath: string | undefined, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  if (inputPath) {
    await syncPreprocessInputs(context, inputPath);
  }
  await ensureFile(path.join(paths.setupOutputDir, 'sigma_preprocess.rkyv'));
  await ensureFile(path.join(paths.synthOutputDir, 'permutation.json'));
  await ensureFile(path.join(paths.synthOutputDir, 'instance.json'));

  await fs.mkdir(paths.preprocessOutputDir, { recursive: true });
  log(`Preprocess: running backend preprocess (target=${detectPlatform()})`);
  await runBackendCommand(
    context,
    paths.preprocessBinary,
    [
      '--crs',
      paths.setupOutputDir,
      '--synthesizer-stat',
      paths.synthOutputDir,
      '--output',
      paths.preprocessOutputDir,
    ],
    verbose,
  );
  ok(`Preprocess complete → ${paths.preprocessOutputDir}`);
}

async function runProve(context: RuntimeContext, inputPath: string | undefined, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  if (inputPath) {
    await syncProveInputs(context, inputPath);
  }
  await ensureFile(path.join(paths.setupOutputDir, 'combined_sigma.rkyv'));
  await ensureFile(path.join(paths.synthOutputDir, 'instance.json'));
  await ensureFile(path.join(paths.synthOutputDir, 'permutation.json'));
  await ensureFile(path.join(paths.synthOutputDir, 'placementVariables.json'));

  await fs.mkdir(paths.proveOutputDir, { recursive: true });
  log(`Prove: running backend prove (target=${detectPlatform()})`);
  await runBackendCommand(
    context,
    paths.proveBinary,
    [
      '--crs',
      paths.setupOutputDir,
      '--synthesizer-stat',
      paths.synthOutputDir,
      '--output',
      paths.proveOutputDir,
    ],
    verbose,
  );
  ok(`Proof artifacts available in ${paths.proveOutputDir}`);
}

async function runVerify(context: RuntimeContext, inputPath: string | undefined, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  if (inputPath) {
    await syncVerifyInputs(context, inputPath);
  }
  await ensureFile(path.join(paths.setupOutputDir, 'sigma_verify.json'));
  await ensureFile(path.join(paths.preprocessOutputDir, 'preprocess.json'));
  await ensureFile(path.join(paths.proveOutputDir, 'proof.json'));
  await ensureFile(path.join(paths.synthOutputDir, 'instance.json'));

  log(`Verify: using artifacts in ${paths.resourceDir}`);
  const result = await runBackendCommand(
    context,
    paths.verifyBinary,
    [
      '--crs',
      paths.setupOutputDir,
      '--synthesizer-stat',
      paths.synthOutputDir,
      '--preprocess',
      paths.preprocessOutputDir,
      '--proof',
      paths.proveOutputDir,
    ],
    verbose,
  );

  const lastLine = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
  if (lastLine !== 'true') {
    err(`Verify: verify output => ${lastLine ?? '<empty>'}`);
  }
  ok(`Verify: verify output => ${lastLine}`);
}

async function extractProofBundle(context: RuntimeContext, outputPathRaw: string, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  const outputPath = resolveUserPath(outputPathRaw);
  const outputDir = path.dirname(outputPath);
  const outputName = path.basename(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  const requiredFiles = [
    path.join(paths.synthOutputDir, 'instance.json'),
    path.join(paths.synthOutputDir, 'instance_description.json'),
    path.join(paths.preprocessOutputDir, 'preprocess.json'),
    path.join(paths.proveOutputDir, 'proof.json'),
  ];
  for (const filePath of requiredFiles) {
    await ensureFile(filePath);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-proof-bundle-'));
  try {
    await fs.copyFile(path.join(paths.synthOutputDir, 'instance.json'), path.join(tempDir, 'instance.json'));
    await fs.copyFile(
      path.join(paths.synthOutputDir, 'instance_description.json'),
      path.join(tempDir, 'instance_description.json'),
    );
    await fs.copyFile(
      path.join(paths.preprocessOutputDir, 'preprocess.json'),
      path.join(tempDir, 'preprocess.json'),
    );
    await fs.copyFile(path.join(paths.proveOutputDir, 'proof.json'), path.join(tempDir, 'proof.json'));
    const benchmarkPath = path.join(paths.proveOutputDir, 'benchmark.json');
    if (await fileExists(benchmarkPath)) {
      await fs.copyFile(benchmarkPath, path.join(tempDir, 'benchmark.json'));
    }
    await runCommand('zip', ['-qr', outputName, '.'], {
      cwd: tempDir,
      verbose,
    });
    await fs.copyFile(path.join(tempDir, outputName), outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  ok(`Proof bundle written → ${outputPath}`);
}

async function runDoctor(verbose: boolean): Promise<void> {
  const platform = detectPlatform();
  const state = await requireInstalledRuntime().catch(() => null);
  if (verbose) {
    info(verbose, `Node version: ${process.version}`);
    info(verbose, `Platform: ${platform}`);
  }
  if (state === null) {
    err('Runtime not installed. Run `tokamak-cli --install` first.');
  }
  ok('Runtime installation looks healthy');
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  switch (parsed.command) {
    case 'install': {
      const context = await installRuntime({
        docker: parsed.installOptions?.docker ?? false,
        verbose: parsed.verbose,
        noSetup: parsed.installOptions?.noSetup ?? false,
        trustedSetup: parsed.installOptions?.trustedSetup ?? false,
      });
      ok(`Install complete for package ${context.packageVersion}`);
      return;
    }
    case 'uninstall': {
      const context = await uninstallRuntime();
      ok(`Uninstall complete for ${context.platformDir}`);
      return;
    }
    case 'doctor':
      await runDoctor(parsed.verbose);
      return;
    default:
      break;
  }

  const context = await requireInstalledRuntime();
  const paths = runtimePaths(context);
  switch (parsed.command) {
    case 'synthesize': {
      const normalized = normalizeSynthesizeArgs(parsed.synthesizeArgs ?? []);
      await ensureFile(normalized.previousState);
      await ensureFile(normalized.transaction);
      await ensureFile(normalized.blockInfo);
      await ensureFile(normalized.contractCode);
      await emptyDir(paths.synthOutputDir);
      log('Synthesize: executing synthesizer-node API...');
      await runTokamakChannelTxFromFiles(normalized, paths.synthOutputDir);
      ok(`Synth outputs written → ${paths.synthOutputDir}`);
      return;
    }
    case 'preprocess':
      await runPreprocess(context, parsed.arg1, parsed.verbose);
      return;
    case 'prove':
      await runProve(context, parsed.arg1, parsed.verbose);
      return;
    case 'verify':
      await runVerify(context, parsed.arg1, parsed.verbose);
      return;
    case 'extract-proof':
      await extractProofBundle(context, parsed.arg1 ?? '', parsed.verbose);
      return;
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\x1b[1;31m[error]\x1b[0m ${message}`);
  process.exit(1);
});
