import fs from 'node:fs/promises';
import {
  activateManagedPrerequisiteEnvironment,
  assertPrerequisiteInstallMayRunAsCurrentUser,
  assertPrerequisiteInstallIsInteractive,
  buildPrerequisiteInstallationPlan,
  confirmPrerequisiteInstallation,
  detectNativeInstallPrerequisites,
  detectSupportedNativeOs,
  executePrerequisiteInstallationPlan,
  prerequisiteVerificationFailures,
  renderPrerequisiteInstallationPlan,
  type SupportedNativeOs,
} from './prerequisites.js';
import {
  createDockerRuntimeContext,
  createRuntimeContext,
  removeDirectoryIfEmpty,
  requireInstalledRuntimeState,
} from './runtime/context.js';
import { installDockerRuntime, resolveRuntimeExecution } from './runtime/docker.js';
import { installIcicleRuntime } from './runtime/icicle.js';
import {
  buildBackendReleaseBinaries,
  configureMacosRuntime,
  copyBuiltBackendBinaries,
  ensureVendoredBackendExists,
} from './runtime/native.js';
import { installDownloadedSetup, withDownloadedVerifierSetup, type DownloadedVerifierSetup } from './runtime/setup.js';
import { installStagedRuntime } from './runtime/transaction.js';
import type {
  InstallOptions,
  NativeRuntimeOs,
  RuntimeContext,
  RuntimeExecution,
  RuntimeState,
} from './runtime/model.js';

interface PrerequisiteFailure {
  name: string;
  reason: string;
}
import { commandExists, createSystemCommandProbe, logVerbose } from './system.js';

export {
  createDockerRuntimeContext,
  createRuntimeContext,
  detectPlatform,
  readInstalledState,
  resolveCacheRoot,
  resolvePackageRoot,
  runtimePaths,
} from './runtime/context.js';
export { runBackendCommand } from './runtime/docker.js';
export type {
  CliPlatform,
  DockerEnvironment,
  InstallOptions,
  InstalledRuntime,
  RuntimeContext,
  RuntimeExecution,
  RuntimeState,
} from './runtime/model.js';

export async function requireInstalledRuntime(): Promise<RuntimeExecution> {
  return await resolveRuntimeExecution(await requireInstalledRuntimeState());
}

function collectPrerequisiteFailures(
  nativeOs: SupportedNativeOs,
): PrerequisiteFailure[] {
  const failures = collectBootstrapPrerequisiteFailures();
  for (const failure of prerequisiteVerificationFailures(
    detectNativeInstallPrerequisites(nativeOs),
  )) {
    failures.push({ name: 'managed prerequisite', reason: failure });
  }
  return failures;
}

function collectBootstrapPrerequisiteFailures(): PrerequisiteFailure[] {
  const failures: PrerequisiteFailure[] = [];
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
    failures.push({
      name: 'node',
      reason: `Node.js ${process.version} is installed, but tokamak-cli requires Node.js 20 or newer.`,
    });
  }

  if (!commandExists('npm')) {
    failures.push({ name: 'npm', reason: 'npm is not available on PATH.' });
  }
  return failures;
}

function throwPrerequisiteFailures(heading: string, failures: readonly PrerequisiteFailure[]): never {
  throw new Error([
    heading,
    ...failures.map((failure) => `- ${failure.name}: ${failure.reason}`),
  ].join('\n'));
}

function ensureInstallPrerequisites(nativeOs: SupportedNativeOs): void {
  const failures = collectPrerequisiteFailures(nativeOs);
  if (failures.length === 0) {
    return;
  }
  throwPrerequisiteFailures(
    'tokamak-cli cannot start the local install because required build prerequisites are missing. Run `tokamak-cli --install --include-prerequisite` for the same setup mode, or install the listed requirements manually.',
    failures,
  );
}

function ensureBootstrapPrerequisites(): void {
  const failures = collectBootstrapPrerequisiteFailures();
  if (failures.length === 0) {
    return;
  }
  throwPrerequisiteFailures(
    'tokamak-cli cannot install managed prerequisites because its Node.js and npm bootstrap requirements are missing. Install them manually, then retry.',
    failures,
  );
}

async function installMissingPrerequisites(
  nativeOs: SupportedNativeOs,
  options: InstallOptions,
): Promise<void> {
  assertPrerequisiteInstallMayRunAsCurrentUser();
  assertPrerequisiteInstallIsInteractive();
  const probe = createSystemCommandProbe();
  const statuses = detectNativeInstallPrerequisites(nativeOs, probe);
  const plan = buildPrerequisiteInstallationPlan(
    nativeOs,
    statuses,
    nativeOs.platform === 'macos' && probe.exists('brew'),
  );

  if (plan.actions.length === 0) {
    process.stdout.write(`${renderPrerequisiteInstallationPlan(plan)}\n`);
  } else {
    if (!(await confirmPrerequisiteInstallation(plan))) {
      throw new Error('Prerequisite installation was declined. No host or runtime changes were made.');
    }

    const result = await executePrerequisiteInstallationPlan(plan, { verbose: options.verbose });
    if (result === 'rerun-required') {
      throw new Error(
        'Apple\'s Command Line Tools installer was launched. Complete the installation, then rerun the same tokamak-cli command.',
      );
    }
  }

  const verifiedStatuses = detectNativeInstallPrerequisites(nativeOs);
  const verificationFailures = prerequisiteVerificationFailures(verifiedStatuses);
  if (verificationFailures.length > 0) {
    throw new Error(
      [
        'Prerequisite installation finished, but verification failed. The backend install was not started.',
        ...verificationFailures.map((failure) => `- ${failure}`),
        'Resolve the reported issue and rerun the same tokamak-cli command. No alternate version or installer was attempted.',
      ].join('\n'),
    );
  }
}

export async function installRuntime(options: InstallOptions): Promise<RuntimeContext> {
  if (options.docker) {
    return await installDockerRuntime(options);
  }

  activateManagedPrerequisiteEnvironment();
  const nativeOs = await detectSupportedNativeOs();
  const context = await createRuntimeContext();
  ensureBootstrapPrerequisites();
  if (options.includePrerequisite) {
    await installMissingPrerequisites(nativeOs, options);
  }
  ensureInstallPrerequisites(nativeOs);
  const backendRoot = await ensureVendoredBackendExists(context.packageRoot);

  logVerbose(options.verbose, `Using vendored backend ${backendRoot}`);
  await withDownloadedVerifierSetup(context, options.verbose, async (setup) => {
    const builtBackend = await buildBackendReleaseBinaries(backendRoot, options, context, setup.directory);
    const state: RuntimeState = {
      backendRuntimeIdentity: builtBackend.runtimeIdentity,
      installMode: 'native',
      packageVersion: context.packageVersion,
      platform: context.platform,
      installedAt: new Date().toISOString(),
    };
    await installStagedRuntime(context, state, async (stagingContext) => {
      await populateNativeRuntime(stagingContext, nativeOs, options, builtBackend.backendReleaseDir, setup);
    });
  });
  return context;
}

/** Prepares a native runtime in a caller-provided staging directory without writing selector state. */
export async function prepareNativeRuntime(
  context: RuntimeContext,
  nativeOs: NativeRuntimeOs,
  options: InstallOptions,
  stagingContext: RuntimeContext,
): Promise<RuntimeState['backendRuntimeIdentity']> {
  if (stagingContext.platformDir !== context.platformDir || stagingContext.runtimeDir === context.runtimeDir) {
    throw new Error('Prepared native runtime must use a distinct staging directory for the selected platform.');
  }
  const backendRoot = await ensureVendoredBackendExists(context.packageRoot);
  return withDownloadedVerifierSetup(context, options.verbose, async (setup) => {
    const builtBackend = await buildBackendReleaseBinaries(backendRoot, options, context, setup.directory);
    await populateNativeRuntime(stagingContext, nativeOs, options, builtBackend.backendReleaseDir, setup);
    return builtBackend.runtimeIdentity;
  });
}

async function populateNativeRuntime(
  stagingContext: RuntimeContext,
  nativeOs: NativeRuntimeOs,
  options: InstallOptions,
  backendReleaseDir: string,
  setup: DownloadedVerifierSetup,
): Promise<void> {
  await copyBuiltBackendBinaries(stagingContext, backendReleaseDir);
  await installIcicleRuntime(stagingContext, nativeOs, options.verbose);
  await configureMacosRuntime(stagingContext, options.verbose);

  await installDownloadedSetup(stagingContext, backendReleaseDir, options.verbose, setup, options.noFullSetup);
}

export async function uninstallRuntime(): Promise<RuntimeContext> {
  const context = process.platform === 'win32'
    ? await createDockerRuntimeContext()
    : await createRuntimeContext();
  await fs.rm(context.platformDir, { recursive: true, force: true });
  await removeDirectoryIfEmpty(context.cacheRoot);
  return context;
}
