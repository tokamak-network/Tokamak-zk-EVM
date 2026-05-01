#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import {
  runTokamakChannelTxFromFiles,
  type TokamakChannelTxFiles,
} from '@tokamak-zk-evm/synthesizer-node';
import {
  type CommandResult,
  installRuntime,
  requireInstalledRuntime,
  runBackendCommand,
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

type RuntimePaths = ReturnType<typeof runtimePaths>;
type RuntimeDirectoryKey =
  | 'setupOutputDir'
  | 'synthOutputDir'
  | 'preprocessOutputDir'
  | 'proveOutputDir'
  | 'subcircuitLibraryDir'
  | 'subcircuitLibraryPackageDir';

interface RuntimeFileRef {
  directory: RuntimeDirectoryKey;
  filename: string;
}

interface StageInputSyncRuleTemplate {
  destinationDir: RuntimeDirectoryKey;
  optionalFiles?: readonly string[];
  requiredFiles: readonly string[];
}

const PREPROCESS_INPUT_RULES = [
  {
    destinationDir: 'synthOutputDir',
    requiredFiles: ['permutation.json', 'instance.json'],
  },
] as const satisfies readonly StageInputSyncRuleTemplate[];

const PROVE_INPUT_RULES = [
  {
    destinationDir: 'synthOutputDir',
    requiredFiles: ['instance.json', 'permutation.json', 'placementVariables.json'],
    optionalFiles: ['instance_description.json', 'state_snapshot.json'],
  },
] as const satisfies readonly StageInputSyncRuleTemplate[];

const VERIFY_INPUT_RULES = [
  {
    destinationDir: 'proveOutputDir',
    requiredFiles: ['proof.json'],
  },
  {
    destinationDir: 'preprocessOutputDir',
    requiredFiles: ['preprocess.json'],
  },
  {
    destinationDir: 'synthOutputDir',
    requiredFiles: ['instance.json'],
  },
] as const satisfies readonly StageInputSyncRuleTemplate[];

const PREPROCESS_REQUIRED_FILES = [
  { directory: 'subcircuitLibraryDir', filename: 'subcircuitInfo.json' },
  { directory: 'setupOutputDir', filename: 'sigma_preprocess.rkyv' },
  { directory: 'synthOutputDir', filename: 'permutation.json' },
  { directory: 'synthOutputDir', filename: 'instance.json' },
] as const satisfies readonly RuntimeFileRef[];

const PROVE_REQUIRED_FILES = [
  { directory: 'subcircuitLibraryDir', filename: 'subcircuitInfo.json' },
  { directory: 'setupOutputDir', filename: 'combined_sigma.rkyv' },
  { directory: 'synthOutputDir', filename: 'instance.json' },
  { directory: 'synthOutputDir', filename: 'permutation.json' },
  { directory: 'synthOutputDir', filename: 'placementVariables.json' },
] as const satisfies readonly RuntimeFileRef[];

const VERIFY_REQUIRED_FILES = [
  { directory: 'subcircuitLibraryDir', filename: 'subcircuitInfo.json' },
  { directory: 'setupOutputDir', filename: 'sigma_verify.json' },
  { directory: 'preprocessOutputDir', filename: 'preprocess.json' },
  { directory: 'proveOutputDir', filename: 'proof.json' },
  { directory: 'synthOutputDir', filename: 'instance.json' },
] as const satisfies readonly RuntimeFileRef[];

interface PackageJson {
  name?: string;
  version?: string;
}

const PROOF_BUNDLE_REQUIRED_FILES = [
  { directory: 'synthOutputDir', filename: 'instance.json' },
  { directory: 'synthOutputDir', filename: 'instance_description.json' },
  { directory: 'preprocessOutputDir', filename: 'preprocess.json' },
  { directory: 'proveOutputDir', filename: 'proof.json' },
] as const satisfies readonly RuntimeFileRef[];

const PROOF_BUNDLE_OPTIONAL_FILES = [
  { directory: 'proveOutputDir', filename: 'benchmark.json' },
] as const satisfies readonly RuntimeFileRef[];

function printUsage(): void {
  console.log(`
Commands:
  --install [--trusted-setup] [--no-setup] [--docker]
      Build the local Tokamak zk-EVM runtime from the packaged backend workspace and prepare local resources
      Install @tokamak-zk-evm/subcircuit-library at the same version as tokamak-cli
      By default setup artifacts are installed from the published CRS archive
      Use --trusted-setup to generate setup artifacts locally with the trusted-setup binary
      Use --no-setup to skip setup artifact provisioning
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

async function emptyDir(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
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
  const args = argv.slice(1).filter((arg) => arg !== '--verbose');
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

interface StageInputSyncRule {
  destinationDir: string;
  optionalFiles?: readonly string[];
  requiredFiles: readonly string[];
}

interface BackendStageOptions {
  args: string[];
  binaryPath: string;
  inputPath?: string;
  logMessage: string;
  outputDir?: string;
  postProcessResult?: (result: CommandResult) => string;
  requiredFiles: readonly string[];
  successMessage?: string;
  syncInputs?: (inputPath: string) => Promise<void>;
  verbose: boolean;
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
    rejectUnknownCommandArgs(argv, '--uninstall');
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

function parseBackendVersion(binaryName: string, stdout: string, stderr: string): string {
  const output = `${stdout}\n${stderr}`;
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const versionPattern = /\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/u;
  const versionLine = lines.find((line) => line.startsWith(binaryName) && versionPattern.test(line))
    ?? lines.find((line) => versionPattern.test(line));
  const version = versionLine?.match(versionPattern)?.[0];
  if (version === undefined) {
    err(`Could not read ${binaryName} version from --version output.`);
  }
  return version;
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
  await syncStageInputs(inputPath, 'tokamak-preprocess', resolveStageInputRules(paths, PREPROCESS_INPUT_RULES));
}

async function syncProveInputs(context: RuntimeContext, inputPath: string): Promise<void> {
  const paths = runtimePaths(context);
  await syncStageInputs(inputPath, 'tokamak-prove', resolveStageInputRules(paths, PROVE_INPUT_RULES));
}

async function syncVerifyInputs(context: RuntimeContext, inputPath: string): Promise<void> {
  const paths = runtimePaths(context);
  await syncStageInputs(inputPath, 'tokamak-verify', resolveStageInputRules(paths, VERIFY_INPUT_RULES));
}

async function runPreprocess(context: RuntimeContext, inputPath: string | undefined, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  await runBackendStage(context, {
    binaryPath: paths.preprocessBinary,
    inputPath,
    logMessage: `Preprocess: running backend preprocess (target=${context.platform})`,
    outputDir: paths.preprocessOutputDir,
    requiredFiles: resolveRuntimeFiles(paths, PREPROCESS_REQUIRED_FILES),
    successMessage: `Preprocess complete → ${paths.preprocessOutputDir}`,
    syncInputs: async (resolvedInputPath) => syncPreprocessInputs(context, resolvedInputPath),
    verbose,
    args: backendOutputArgs(paths, paths.preprocessOutputDir),
  });
}

async function runProve(context: RuntimeContext, inputPath: string | undefined, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  await runBackendStage(context, {
    binaryPath: paths.proveBinary,
    inputPath,
    logMessage: `Prove: running backend prove (target=${context.platform})`,
    outputDir: paths.proveOutputDir,
    requiredFiles: resolveRuntimeFiles(paths, PROVE_REQUIRED_FILES),
    successMessage: `Proof artifacts available in ${paths.proveOutputDir}`,
    syncInputs: async (resolvedInputPath) => syncProveInputs(context, resolvedInputPath),
    verbose,
    args: backendOutputArgs(paths, paths.proveOutputDir),
  });
}

async function runVerify(context: RuntimeContext, inputPath: string | undefined, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  await runBackendStage(context, {
    binaryPath: paths.verifyBinary,
    inputPath,
    logMessage: `Verify: using artifacts in ${paths.resourceDir}`,
    postProcessResult: (result) => {
      const lastLine = getLastNonEmptyLine(result.stdout);
      if (lastLine !== 'true') {
        err(`Verify: verify output => ${lastLine ?? '<empty>'}`);
      }
      return `Verify: verify output => ${lastLine}`;
    },
    requiredFiles: resolveRuntimeFiles(paths, VERIFY_REQUIRED_FILES),
    syncInputs: async (resolvedInputPath) => syncVerifyInputs(context, resolvedInputPath),
    verbose,
    args: backendVerifyArgs(paths),
  });
}

function runtimeFilePath(paths: RuntimePaths, file: RuntimeFileRef): string {
  return path.join(paths[file.directory], file.filename);
}

function resolveRuntimeFiles(paths: RuntimePaths, files: readonly RuntimeFileRef[]): string[] {
  return files.map((file) => runtimeFilePath(paths, file));
}

function resolveStageInputRules(
  paths: RuntimePaths,
  rules: readonly StageInputSyncRuleTemplate[],
): StageInputSyncRule[] {
  return rules.map((rule) => ({
    destinationDir: paths[rule.destinationDir],
    requiredFiles: rule.requiredFiles,
    optionalFiles: rule.optionalFiles,
  }));
}

function backendOutputArgs(paths: RuntimePaths, outputDir: string): string[] {
  return [
    '--subcircuit-library',
    paths.subcircuitLibraryDir,
    '--crs',
    paths.setupOutputDir,
    '--synthesizer-stat',
    paths.synthOutputDir,
    '--output',
    outputDir,
  ];
}

function backendVerifyArgs(paths: RuntimePaths): string[] {
  return [
    '--subcircuit-library',
    paths.subcircuitLibraryDir,
    '--crs',
    paths.setupOutputDir,
    '--synthesizer-stat',
    paths.synthOutputDir,
    '--preprocess',
    paths.preprocessOutputDir,
    '--proof',
    paths.proveOutputDir,
  ];
}

async function syncStageInputs(
  inputPath: string,
  prefix: string,
  rules: StageInputSyncRule[],
): Promise<void> {
  await withDirFromPath(inputPath, prefix, async (dirPath) => {
    for (const rule of rules) {
      await copyNamedFilesFromDir(dirPath, rule.destinationDir, rule.requiredFiles, true);
      if (rule.optionalFiles?.length) {
        await copyNamedFilesFromDir(dirPath, rule.destinationDir, rule.optionalFiles, false);
      }
    }
  });
}

async function runBackendStage(context: RuntimeContext, options: BackendStageOptions): Promise<void> {
  if (options.inputPath && options.syncInputs) {
    await options.syncInputs(options.inputPath);
  }
  for (const requiredFile of options.requiredFiles) {
    await ensureFile(requiredFile);
  }
  if (options.outputDir) {
    await fs.mkdir(options.outputDir, { recursive: true });
  }

  log(options.logMessage);
  const result = await runBackendCommand(context, options.binaryPath, options.args, options.verbose);
  const successMessage = options.postProcessResult?.(result) ?? options.successMessage;
  if (!successMessage) {
    err(`Missing success message for backend stage ${path.basename(options.binaryPath)}`);
  }
  ok(successMessage);
}

function getLastNonEmptyLine(content: string): string | undefined {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
}

async function readPackageJson(filePath: string): Promise<PackageJson> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as PackageJson;
}

async function checkSubcircuitLibrary(context: RuntimeContext, paths: RuntimePaths): Promise<void> {
  await ensureFile(path.join(paths.subcircuitLibraryDir, 'subcircuitInfo.json'));
  const packageJson = await readPackageJson(paths.subcircuitLibraryPackageJson);
  if (packageJson.name !== '@tokamak-zk-evm/subcircuit-library') {
    err(`Subcircuit library package name mismatch: ${packageJson.name ?? '<missing>'}`);
  }
  if (packageJson.version !== context.packageVersion) {
    err(
      `Subcircuit library version ${packageJson.version ?? '<missing>'} does not match tokamak-cli version ${context.packageVersion}.`,
    );
  }
  ok(`subcircuit-library version: ${packageJson.version}`);
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
  for (const filePath of resolveRuntimeFiles(paths, PROOF_BUNDLE_OPTIONAL_FILES)) {
    if (await fileExists(filePath)) {
      archive.addLocalFile(filePath);
    }
  }
  if (verbose) {
    info(verbose, `Writing proof bundle archive: ${outputName}`);
  }
  archive.writeZip(outputPath);
  ok(`Proof bundle written → ${outputPath}`);
}

async function runDoctor(verbose: boolean): Promise<void> {
  const installCommand = process.platform === 'win32'
    ? 'tokamak-cli --install --docker'
    : 'tokamak-cli --install';
  const context = await requireInstalledRuntime().catch((error: unknown) => {
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
    if (context !== null) {
      info(verbose, `Runtime platform: ${context.platform}`);
    }
  }
  if (context === null) {
    err(`Runtime not installed. Run \`${installCommand}\` first.`);
  }
  const paths = runtimePaths(context);
  await checkSubcircuitLibrary(context, paths);
  const backendBinaries = [
    ['preprocess', paths.preprocessBinary],
    ['prove', paths.proveBinary],
    ['verify', paths.verifyBinary],
  ] as const;
  for (const [binaryName, binaryPath] of backendBinaries) {
    const result = await runBackendCommand(context, binaryPath, ['--version'], verbose, { quiet: true });
    ok(`${binaryName} version: ${parseBackendVersion(binaryName, result.stdout, result.stderr)}`);
  }
  ok(`Runtime workspace: ${context.runtimeDir}`);
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
