#!/usr/bin/env node

import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import {
  buildMetadata as synthesizerBuildMetadata,
  runTokamakChannelTxFromFiles,
  type TokamakChannelTxFiles,
} from '@tokamak-zk-evm/synthesizer-node';
import {
  createDockerRuntimeContext,
  createRuntimeContext,
  installRuntime,
  requireInstalledRuntime,
  runBackendCommand,
  runtimePaths,
  uninstallRuntime,
  type RuntimeContext,
  type RuntimeExecution,
} from './runtime.js';
import type { CommandResult } from './system.js';
import { BACKEND_PACKAGE_NAMES } from './generated/backend-build-metadata-validator.generated.js';
import { assertLiveBackendRuntimeIdentity, validateSynthesizerBuildMetadataForContext } from './runtime/identity.js';
import { acquireRuntimeOperationLock } from './runtime/operation-lock.js';
import { promoteStagedRuntimePaths } from './runtime/stage-transaction.js';
import { parseBackendVerificationResult } from './runtime/verification-result.js';

type CommandName =
  'install' | 'uninstall' | 'synthesize' | 'preprocess' | 'prove' | 'verify' | 'extract-proof' | 'doctor';

export interface ParsedArgs {
  command: CommandName;
  verbose: boolean;
  installOptions?: {
    docker: boolean;
    includePrerequisite: boolean;
    noFullSetup: boolean;
  };
  synthesizeArgs?: string[];
  arg1?: string;
}

type RuntimePaths = ReturnType<typeof runtimePaths>;
type RuntimeDirectoryKey = 'setupOutputDir' | 'synthOutputDir' | 'preprocessOutputDir' | 'proveOutputDir';

interface RuntimeFileRef {
  directory: RuntimeDirectoryKey;
  filename: string;
}

interface StageInputSyncRule {
  destinationDir: RuntimeDirectoryKey;
  optionalFiles?: readonly string[];
  requiredFiles: readonly string[];
}

export const PREPROCESS_INPUT_RULES = [
  {
    destinationDir: 'synthOutputDir',
    requiredFiles: ['selector.json', 'permutation.json', 'instance.json'],
  },
] as const satisfies readonly StageInputSyncRule[];

export const PROVE_INPUT_RULES = [
  {
    destinationDir: 'synthOutputDir',
    requiredFiles: ['selector.json', 'instance.json', 'permutation.json', 'placementVariables.json'],
    optionalFiles: ['instance_description.json', 'state_snapshot.json'],
  },
] as const satisfies readonly StageInputSyncRule[];

export const VERIFY_INPUT_RULES = [
  {
    destinationDir: 'proveOutputDir',
    requiredFiles: ['univariate_proof.bin'],
  },
  {
    destinationDir: 'preprocessOutputDir',
    requiredFiles: ['univariate_verifier_preprocess.bin'],
  },
  {
    destinationDir: 'synthOutputDir',
    requiredFiles: ['instance.json'],
  },
] as const satisfies readonly StageInputSyncRule[];

export const PREPROCESS_REQUIRED_FILES = [
  { directory: 'setupOutputDir', filename: 'preprocess_keys.rkyv' },
  { directory: 'setupOutputDir', filename: 'crs_provenance.json' },
  { directory: 'synthOutputDir', filename: 'selector.json' },
  { directory: 'synthOutputDir', filename: 'permutation.json' },
  { directory: 'synthOutputDir', filename: 'instance.json' },
] as const satisfies readonly RuntimeFileRef[];

export const PROVE_REQUIRED_FILES = [
  { directory: 'setupOutputDir', filename: 'tau_sequence.rkyv' },
  { directory: 'setupOutputDir', filename: 'prover_keys.rkyv' },
  { directory: 'setupOutputDir', filename: 'crs_provenance.json' },
  { directory: 'synthOutputDir', filename: 'selector.json' },
  { directory: 'synthOutputDir', filename: 'instance.json' },
  { directory: 'synthOutputDir', filename: 'permutation.json' },
  { directory: 'synthOutputDir', filename: 'placementVariables.json' },
] as const satisfies readonly RuntimeFileRef[];

export const VERIFY_REQUIRED_FILES = [
  { directory: 'preprocessOutputDir', filename: 'univariate_verifier_preprocess.bin' },
  { directory: 'proveOutputDir', filename: 'univariate_proof.bin' },
  { directory: 'synthOutputDir', filename: 'instance.json' },
] as const satisfies readonly RuntimeFileRef[];

export const PROOF_BUNDLE_REQUIRED_FILES = [
  { directory: 'synthOutputDir', filename: 'instance.json' },
  { directory: 'preprocessOutputDir', filename: 'univariate_verifier_preprocess.bin' },
  { directory: 'proveOutputDir', filename: 'univariate_proof.bin' },
] as const satisfies readonly RuntimeFileRef[];

function printUsage(): void {
  console.log(`
Commands:
  --install [--no-full-setup] [--include-prerequisite] [--docker]
      Build the local Tokamak zk-EVM runtime from the packaged backend workspace and prepare local resources
      By default setup artifacts are installed from the published CRS files
      Use --no-full-setup to fetch only verifier keys and provenance before building
      Use --include-prerequisite to interactively install missing native build prerequisites
      Use --docker on Linux or Windows with Docker Desktop to install and run backend commands through an Ubuntu 22 container

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
      If an input directory or zip is provided, it must include selector.json, permutation.json, and instance.json

  --prove [<SYNTH_OUTPUT_ZIP|DIR>]
      Run backend prove stage
      If an input directory or zip is provided, it must include selector.json, placementVariables.json, permutation.json, and instance.json

  --verify [<PROOF_ZIP|DIR>]
      Verify a proof saved under the installed runtime
      If an input directory or zip is provided, it must include univariate_proof.bin, univariate_verifier_preprocess.bin, and instance.json

  --extract-proof <OUTPUT_ZIP_PATH>
      Collect proof artifacts from the installed runtime and zip them to the given path

  --doctor
      Check package and runtime health

  --help
      Show this help

Options:
  --verbose        Show detailed output
  --no-full-setup  Fetch verifier keys and provenance; skip remaining CRS files
  --include-prerequisite
                   Interactively install missing native build prerequisites during --install
  --docker         Install through Docker on Linux or Windows with Docker Desktop and save a Docker bootstrap
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

async function copyNamedFilesFromDir(
  sourceDir: string,
  destinationDir: string,
  filenames: readonly string[],
  required: boolean,
): Promise<void> {
  await fs.mkdir(destinationDir, { recursive: true });
  for (const filename of filenames) {
    const sourcePath = path.join(sourceDir, filename);
    if (!(await fileExists(sourcePath))) {
      if (!required) {
        continue;
      }
      err(`Missing ${filename} under ${sourceDir}`);
    }
    await fs.copyFile(sourcePath, path.join(destinationDir, filename));
  }
}

async function validateNamedFilesFromDir(
  sourceDir: string,
  filenames: readonly string[],
  required: boolean,
): Promise<void> {
  for (const filename of filenames) {
    const sourcePath = path.join(sourceDir, filename);
    if (!(await fileExists(sourcePath)) && required) {
      err(`Missing ${filename} under ${sourceDir}`);
    }
  }
}

async function extractZipToTemp(zipPath: string, prefix: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  try {
    const archive = new AdmZip(zipPath);
    const root = path.resolve(tmpDir);
    for (const entry of archive.getEntries()) {
      const entryName = entry.entryName.replace(/\\/gu, '/');
      const targetPath = path.resolve(root, entryName);
      if (targetPath !== root && !targetPath.startsWith(`${root}${path.sep}`)) {
        err(`Unsafe zip entry path: ${entry.entryName}`);
      }
      if (entry.isDirectory) {
        await fs.mkdir(targetPath, { recursive: true });
        continue;
      }
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, entry.getData());
    }
    return tmpDir;
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

function parseSinglePathArg(argv: string[], command: string, required: boolean): string | undefined {
  const args = argv.slice(1).filter(arg => arg !== '--verbose');
  if (args.length === 0) {
    if (required) {
      err(`${command} requires <OUTPUT_ZIP_PATH>`);
    }
    return undefined;
  }
  if (args.length > 1) {
    err(`Unknown option for ${command}: ${args[1]}`);
  }
  return args[0];
}

function rejectUnknownCommandArgs(argv: string[], command: string): void {
  for (const arg of argv.slice(1)) {
    if (arg === '--verbose') continue;
    err(`Unknown option for ${command}: ${arg}`);
  }
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

interface BackendStageOptions {
  args: (paths: RuntimePaths) => string[];
  binaryPath: string;
  inputPath?: string;
  inputRules?: readonly StageInputSyncRule[];
  logMessage: string;
  outputDirectory?: RuntimeDirectoryKey;
  postProcessResult?: (result: CommandResult) => string;
  requiredFiles: (paths: RuntimePaths) => readonly string[];
  quiet?: boolean;
  suppressStdout?: boolean;
  successMessage?: string;
  verbose: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const verbose = argv.includes('--verbose');

  if (argv[0] === '--install') {
    let docker = false;
    let includePrerequisite = false;
    let noFullSetup = false;
    for (const arg of argv.slice(1)) {
      if (arg === '--verbose') continue;
      if (arg === '--docker') {
        docker = true;
        continue;
      }
      if (arg === '--include-prerequisite') {
        includePrerequisite = true;
        continue;
      }
      if (arg === '--no-full-setup') {
        noFullSetup = true;
        continue;
      }
      err(`Unknown option for --install: ${arg}`);
    }
    if (includePrerequisite && docker) {
      err('--include-prerequisite cannot be combined with --docker');
    }
    return {
      command: 'install',
      verbose,
      installOptions: { docker, includePrerequisite, noFullSetup },
    };
  }
  if (argv[0] === '--uninstall') {
    rejectUnknownCommandArgs(argv, '--uninstall');
    return { command: 'uninstall', verbose };
  }

  if (argv[0] === '--synthesize') {
    return {
      command: 'synthesize',
      verbose,
      synthesizeArgs: argv.slice(1).filter(arg => arg !== '--verbose'),
    };
  }

  if (argv[0] === '--preprocess') {
    return { command: 'preprocess', verbose, arg1: parseSinglePathArg(argv, '--preprocess', false) };
  }
  if (argv[0] === '--prove') {
    return { command: 'prove', verbose, arg1: parseSinglePathArg(argv, '--prove', false) };
  }
  if (argv[0] === '--verify') {
    return { command: 'verify', verbose, arg1: parseSinglePathArg(argv, '--verify', false) };
  }
  if (argv[0] === '--extract-proof') {
    const outputPath = parseSinglePathArg(argv, '--extract-proof', true);
    return { command: 'extract-proof', verbose, arg1: outputPath };
  }
  if (argv[0] === '--doctor') {
    rejectUnknownCommandArgs(argv, '--doctor');
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

async function runPreprocess(
  execution: RuntimeExecution,
  inputPath: string | undefined,
  verbose: boolean,
): Promise<void> {
  const { context } = execution;
  const paths = runtimePaths(context);
  await runBackendStage(execution, {
    binaryPath: paths.preprocessBinary,
    inputPath,
    logMessage: `Preprocess: running backend preprocess (target=${context.platform})`,
    outputDirectory: 'preprocessOutputDir',
    requiredFiles: stagePaths => resolveRuntimeFiles(stagePaths, PREPROCESS_REQUIRED_FILES),
    successMessage: `Preprocess complete → ${paths.preprocessOutputDir}`,
    inputRules: PREPROCESS_INPUT_RULES,
    verbose,
    args: stagePaths => backendPreprocessArgs(stagePaths, stagePaths.preprocessOutputDir),
  });
}

async function runProve(execution: RuntimeExecution, inputPath: string | undefined, verbose: boolean): Promise<void> {
  const { context } = execution;
  const paths = runtimePaths(context);
  await runBackendStage(execution, {
    binaryPath: paths.proveBinary,
    inputPath,
    logMessage: `Prove: running backend prove (target=${context.platform})`,
    outputDirectory: 'proveOutputDir',
    requiredFiles: stagePaths => resolveRuntimeFiles(stagePaths, PROVE_REQUIRED_FILES),
    successMessage: `Proof artifacts available in ${paths.proveOutputDir}`,
    inputRules: PROVE_INPUT_RULES,
    verbose,
    args: stagePaths => backendProveArgs(stagePaths, stagePaths.proveOutputDir),
  });
}

async function runVerify(execution: RuntimeExecution, inputPath: string | undefined, verbose: boolean): Promise<void> {
  const { context } = execution;
  const paths = runtimePaths(context);
  await runBackendStage(execution, {
    binaryPath: paths.verifyBinary,
    inputPath,
    logMessage: `Verify: using artifacts in ${paths.resourceDir}`,
    postProcessResult: result => {
      const verification = parseBackendVerificationResult(result.stdout);
      if (!verification.verified) {
        err('Verify: verification failed');
      }
      return 'Verify: verification succeeded';
    },
    requiredFiles: stagePaths => resolveRuntimeFiles(stagePaths, VERIFY_REQUIRED_FILES),
    inputRules: VERIFY_INPUT_RULES,
    verbose,
    args: stagePaths => [...backendVerifyArgs(stagePaths), '--verification-result-json'],
    suppressStdout: true,
  });
}

function runtimeFilePath(paths: RuntimePaths, file: RuntimeFileRef): string {
  return path.join(paths[file.directory], file.filename);
}

function resolveRuntimeFiles(paths: RuntimePaths, files: readonly RuntimeFileRef[]): string[] {
  return files.map(file => runtimeFilePath(paths, file));
}

async function withStagedRuntimePaths<T>(
  paths: RuntimePaths,
  stageName: string,
  inputDirectories: readonly RuntimeDirectoryKey[],
  outputDirectory: RuntimeDirectoryKey | undefined,
  work: (stagedPaths: RuntimePaths) => Promise<T>,
): Promise<T> {
  const stagedRoot = await fs.mkdtemp(path.join(paths.resourceDir, `.${stageName}-staging-`));
  const stagedPaths = { ...paths };
  const promotions: { activePath: string; stagingPath: string }[] = [];
  try {
    for (const directoryKey of inputDirectories) {
      const activePath = paths[directoryKey];
      const stagingPath = path.join(stagedRoot, directoryKey);
      await copyDirectoryIfPresent(activePath, stagingPath);
      stagedPaths[directoryKey] = stagingPath;
      promotions.push({ activePath, stagingPath });
    }
    if (outputDirectory !== undefined) {
      const activePath = paths[outputDirectory];
      const stagingPath = path.join(stagedRoot, outputDirectory);
      await fs.mkdir(stagingPath, { recursive: true });
      stagedPaths[outputDirectory] = stagingPath;
      promotions.push({ activePath, stagingPath });
    }
    const result = await work(stagedPaths);
    if (promotions.length > 0) {
      await promoteStagedRuntimePaths(promotions);
    }
    return result;
  } finally {
    await fs.rm(stagedRoot, { recursive: true, force: true });
  }
}

async function copyDirectoryIfPresent(sourcePath: string, destinationPath: string): Promise<void> {
  if (await fileExists(sourcePath)) {
    await fs.cp(sourcePath, destinationPath, { recursive: true });
    return;
  }
  await fs.mkdir(destinationPath, { recursive: true });
}

type BackendStagePaths = Pick<RuntimePaths, 'setupOutputDir' | 'synthOutputDir'>;

export function backendPreprocessArgs(paths: BackendStagePaths, outputDir: string): string[] {
  return ['--keys', paths.setupOutputDir, '--synthesizer-stat', paths.synthOutputDir, '--output', outputDir];
}

export function backendProveArgs(paths: BackendStagePaths, outputDir: string): string[] {
  return [
    '--tau-sequence',
    path.join(paths.setupOutputDir, 'tau_sequence.rkyv'),
    '--keys',
    paths.setupOutputDir,
    '--synthesizer-stat',
    paths.synthOutputDir,
    '--output',
    outputDir,
  ];
}

export function backendVerifyArgs(paths: RuntimePaths): string[] {
  return [
    '--preprocess',
    path.join(paths.preprocessOutputDir, 'univariate_verifier_preprocess.bin'),
    '--proof',
    path.join(paths.proveOutputDir, 'univariate_proof.bin'),
    '--instance',
    path.join(paths.synthOutputDir, 'instance.json'),
  ];
}

async function syncStageInputs(
  inputPath: string,
  prefix: string,
  paths: RuntimePaths,
  rules: readonly StageInputSyncRule[],
): Promise<void> {
  await withDirFromPath(inputPath, prefix, async dirPath => {
    for (const rule of rules) {
      await validateNamedFilesFromDir(dirPath, rule.requiredFiles, true);
      if (rule.optionalFiles?.length) {
        await validateNamedFilesFromDir(dirPath, rule.optionalFiles, false);
      }
    }
    for (const rule of rules) {
      await copyNamedFilesFromDir(dirPath, paths[rule.destinationDir], rule.requiredFiles, true);
      if (rule.optionalFiles?.length) {
        await copyNamedFilesFromDir(dirPath, paths[rule.destinationDir], rule.optionalFiles, false);
      }
    }
  });
}

async function runBackendStage(execution: RuntimeExecution, options: BackendStageOptions): Promise<void> {
  const paths = runtimePaths(execution.context);
  const stagedInputDirectories =
    options.inputPath === undefined ? [] : [...new Set((options.inputRules ?? []).map(rule => rule.destinationDir))];
  const successMessage = await withStagedRuntimePaths(
    paths,
    path.basename(options.binaryPath),
    stagedInputDirectories,
    options.outputDirectory,
    async stagePaths => {
      if (options.inputPath !== undefined) {
        await syncStageInputs(
          options.inputPath,
          `tokamak-${path.basename(options.binaryPath)}`,
          stagePaths,
          options.inputRules ?? [],
        );
      }
      for (const requiredFile of options.requiredFiles(stagePaths)) {
        await ensureFile(requiredFile);
      }
      if (options.outputDirectory !== undefined) {
        await fs.mkdir(stagePaths[options.outputDirectory], { recursive: true });
      }
      log(options.logMessage);
      const result = await runBackendCommand(execution, options.binaryPath, options.args(stagePaths), options.verbose, {
        quiet: options.quiet,
        suppressStdout: options.suppressStdout,
      });
      return options.postProcessResult?.(result) ?? options.successMessage;
    },
  );
  if (!successMessage) {
    err(`Missing success message for backend stage ${path.basename(options.binaryPath)}`);
  }
  ok(successMessage);
}

async function extractProofBundle(context: RuntimeContext, outputPathRaw: string, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  const outputPath = resolveUserPath(outputPathRaw);
  const outputDir = path.dirname(outputPath);
  const outputName = path.basename(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  for (const filePath of resolveRuntimeFiles(paths, PROOF_BUNDLE_REQUIRED_FILES)) {
    await ensureFile(filePath);
  }

  const archive = new AdmZip();
  for (const filePath of resolveRuntimeFiles(paths, PROOF_BUNDLE_REQUIRED_FILES)) {
    archive.addLocalFile(filePath);
  }
  info(verbose, `Writing proof bundle archive: ${outputName}`);
  const temporaryArchivePath = path.join(outputDir, `.${outputName}.staging-${randomUUID()}.zip`);
  try {
    archive.writeZip(temporaryArchivePath);
    await promoteStagedRuntimePaths([{ activePath: outputPath, stagingPath: temporaryArchivePath }]);
  } finally {
    await fs.rm(temporaryArchivePath, { force: true });
  }
  ok(`Proof bundle written → ${outputPath}`);
}

async function runDoctor(verbose: boolean): Promise<void> {
  const installCommand = process.platform === 'win32' ? 'tokamak-cli --install --docker' : 'tokamak-cli --install';
  const execution = await requireInstalledRuntime().catch((error: unknown) => {
    if (error instanceof Error && error.message.startsWith('Unsupported')) {
      throw error;
    }
    if (error instanceof Error && !error.message.includes('not installed')) {
      throw error;
    }
    return null;
  });
  if (verbose) {
    info(verbose, `Node version: ${process.version}`);
    info(verbose, `Host platform: ${process.platform}`);
    if (execution !== null) {
      info(verbose, `Runtime platform: ${execution.context.platform}`);
    }
  }
  if (execution === null) {
    err(`Runtime not installed. Run \`${installCommand}\` first.`);
  }
  const { context } = execution;
  const paths = runtimePaths(context);
  for (const packageName of BACKEND_PACKAGE_NAMES) {
    const binaryPath = path.join(paths.binaryDir, packageName);
    const result = await runBackendCommand(execution, binaryPath, ['--build-identity-json'], verbose, {
      suppressStdout: true,
    });
    let liveIdentity: unknown;
    try {
      liveIdentity = JSON.parse(result.stdout) as unknown;
    } catch (error) {
      err(`Could not read ${packageName} machine identity: ${error instanceof Error ? error.message : String(error)}`);
    }
    const metadata = assertLiveBackendRuntimeIdentity(
      execution.state.backendRuntimeIdentity,
      packageName,
      liveIdentity,
    );
    ok(
      `${packageName} identity: ${metadata.packageVersion} / subcircuit-library ${metadata.dependencies.subcircuitLibrary.buildVersion}`,
    );
  }
  ok(`Runtime workspace: ${context.runtimeDir}`);
  ok('Runtime installation looks healthy');
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const lockContext = await runtimeContextForOperation(parsed);
  await assertSynthesizerRuntimeMatchesContext(lockContext);
  const operationLock = await acquireRuntimeOperationLock(lockContext, parsed.command);
  try {
    await runCommandWithRuntimeLock(parsed);
  } finally {
    await operationLock.release();
  }
}

async function assertSynthesizerRuntimeMatchesContext(context: RuntimeContext): Promise<void> {
  validateSynthesizerBuildMetadataForContext(synthesizerBuildMetadata, context);
  const synthesizer = await readResolvedPackageManifest(
    '@tokamak-zk-evm/synthesizer-node',
    '@tokamak-zk-evm/synthesizer-node',
  );
  if (synthesizer.version !== context.packageVersion) {
    throw new Error(
      `Installed Node Synthesizer package version ${synthesizer.version} does not match current CLI package version ${context.packageVersion}. Reinstall matching ${context.packageVersion} packages.`,
    );
  }
  const subcircuitLibrary = await readResolvedPackageManifest(
    '@tokamak-zk-evm/subcircuit-library/package.json',
    '@tokamak-zk-evm/subcircuit-library',
  );
  if (subcircuitLibrary.version !== context.packageVersion) {
    throw new Error(
      `Installed subcircuit-library package version ${subcircuitLibrary.version} does not match current CLI package version ${context.packageVersion}. Reinstall matching ${context.packageVersion} packages.`,
    );
  }
}

async function readResolvedPackageManifest(
  request: string,
  expectedName: string,
): Promise<{ name: string; version: string }> {
  const entryPath = require.resolve(request);
  let directory = path.dirname(entryPath);
  while (true) {
    const manifestPath = path.join(directory, 'package.json');
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Partial<{
        name: unknown;
        version: unknown;
      }>;
      if (manifest.name === expectedName && typeof manifest.version === 'string') {
        return { name: manifest.name, version: manifest.version };
      }
    } catch (error) {
      if (!isMissingPathErrorForCli(error)) {
        throw new Error(`Unable to read installed package metadata at ${manifestPath}: ${errorMessageForCli(error)}`);
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`Unable to locate installed package metadata for ${expectedName} from ${request}.`);
    }
    directory = parent;
  }
}

function isMissingPathErrorForCli(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function errorMessageForCli(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runtimeContextForOperation(parsed: ParsedArgs): Promise<RuntimeContext> {
  if (parsed.command === 'install' && parsed.installOptions?.docker) {
    return await createDockerRuntimeContext();
  }
  if (process.platform === 'win32') {
    return await createDockerRuntimeContext();
  }
  return await createRuntimeContext();
}

async function runCommandWithRuntimeLock(parsed: ParsedArgs): Promise<void> {
  switch (parsed.command) {
    case 'install': {
      const context = await installRuntime({
        docker: parsed.installOptions?.docker ?? false,
        includePrerequisite: parsed.installOptions?.includePrerequisite ?? false,
        verbose: parsed.verbose,
        noFullSetup: parsed.installOptions?.noFullSetup ?? false,
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

  const execution = await requireInstalledRuntime();
  const { context } = execution;
  const paths = runtimePaths(context);
  switch (parsed.command) {
    case 'synthesize': {
      const normalized = normalizeSynthesizeArgs(parsed.synthesizeArgs ?? []);
      await ensureFile(normalized.previousState);
      await ensureFile(normalized.transaction);
      await ensureFile(normalized.blockInfo);
      await ensureFile(normalized.contractCode);
      await withStagedRuntimePaths(paths, 'synthesize', [], 'synthOutputDir', async stagePaths => {
        log('Synthesize: executing synthesizer-node API...');
        await runTokamakChannelTxFromFiles(normalized, stagePaths.synthOutputDir);
      });
      ok(`Synth outputs written → ${paths.synthOutputDir}`);
      return;
    }
    case 'preprocess':
      await runPreprocess(execution, parsed.arg1, parsed.verbose);
      return;
    case 'prove':
      await runProve(execution, parsed.arg1, parsed.verbose);
      return;
    case 'verify':
      await runVerify(execution, parsed.arg1, parsed.verbose);
      return;
    case 'extract-proof':
      await extractProofBundle(context, parsed.arg1 ?? '', parsed.verbose);
      return;
  }
}

if (require.main === module) {
  void main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\x1b[1;31m[error]\x1b[0m ${message}`);
    process.exit(1);
  });
}
