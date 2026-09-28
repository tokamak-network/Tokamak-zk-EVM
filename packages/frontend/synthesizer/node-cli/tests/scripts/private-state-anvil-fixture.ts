import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

export type PrivateStateAnvilFixture = Readonly<{
  appDir: string;
  deploymentManifestPath: string;
  storageLayoutPath: string;
}>;

const requiredMakeTargets = ['anvil-stop', 'anvil-start', 'anvil-bootstrap'] as const;

export const runInheritedCommand = async (
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> => new Promise((resolve, reject) => {
  const child = spawn(command, [...args], { cwd, env, stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
  });
});

export const resolvePrivateStateAppDir = (packageRoot: string): string => {
  const configuredPath = process.env.PRIVATE_STATE_APP_DIR?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  const workspaceParent = path.resolve(packageRoot, '..', '..', '..', '..', '..');
  return path.join(workspaceParent, 'Tokamak-zk-EVM-contracts', 'packages', 'apps', 'private-state');
};

const assertPrivateStateApp = async (appDir: string): Promise<void> => {
  const makefilePath = path.join(appDir, 'Makefile');
  let makefile: string;
  try {
    makefile = await fs.readFile(makefilePath, 'utf8');
  } catch {
    throw new Error(`Missing private-state application Makefile: ${makefilePath}`);
  }

  for (const target of requiredMakeTargets) {
    if (!new RegExp(`^${target}:`, 'mu').test(makefile)) {
      throw new Error(`Private-state application is missing required Make target: ${target}`);
    }
  }
};

export const createPrivateStateAnvilFixture = async (
  packageRoot: string,
  label: string,
): Promise<PrivateStateAnvilFixture> => {
  const appDir = resolvePrivateStateAppDir(packageRoot);
  await assertPrivateStateApp(appDir);

  const artifactTimestamp = `synthesizer-topology-${label}-${process.pid}-${Date.now()}`;
  const contractsRoot = path.resolve(appDir, '..', '..', '..');
  const artifactDir = path.join(
    contractsRoot,
    'deployment',
    'chain-id-31337',
    'dapps',
    'private-state',
    artifactTimestamp,
  );
  const deploymentManifestPath = path.join(artifactDir, 'deployment.31337.latest.json');
  const storageLayoutPath = path.join(artifactDir, 'storage-layout.31337.latest.json');

  await runInheritedCommand('make', ['-C', appDir, 'anvil-stop'], packageRoot);
  await runInheritedCommand('make', ['-C', appDir, 'anvil-start'], packageRoot);
  await runInheritedCommand(
    'make',
    ['-C', appDir, `PRIVATE_STATE_ARTIFACT_TIMESTAMP=${artifactTimestamp}`, 'anvil-bootstrap'],
    packageRoot,
  );

  try {
    await Promise.all([fs.access(deploymentManifestPath), fs.access(storageLayoutPath)]);
  } catch {
    throw new Error(
      `Private-state bootstrap did not produce the requested artifact pair under: ${artifactDir}`,
    );
  }

  return { appDir, deploymentManifestPath, storageLayoutPath };
};

export const stopPrivateStateAnvil = async (packageRoot: string): Promise<void> => {
  const appDir = resolvePrivateStateAppDir(packageRoot);
  await runInheritedCommand('make', ['-C', appDir, 'anvil-stop'], packageRoot);
};
