import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);

const takeOption = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${flag}`);
  }
  args.splice(index, 2);
  return value;
};

const hasFlag = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
};

const configName = takeOption('--config-name');
if (configName === undefined) {
  throw new Error('Expected --config-name <name>.');
}

const workspaceFolder = takeOption('--workspace-folder');
if (workspaceFolder === undefined) {
  throw new Error('Expected --workspace-folder <path>.');
}

const tokamakCli = takeOption('--tokamak-cli') ?? path.resolve(process.cwd(), 'tokamak-cli');
const launchFile =
  takeOption('--launch-file') ?? path.resolve(workspaceFolder, '.vscode', 'launch.json');
const dryRun = hasFlag('--dry-run');

if (args.length > 0) {
  throw new Error(`Unexpected arguments: ${args.join(' ')}`);
}

const launchJson = JSON.parse(fs.readFileSync(launchFile, 'utf8'));
if (!Array.isArray(launchJson.configurations)) {
  throw new Error(`Expected "configurations" array in ${launchFile}`);
}

const config = launchJson.configurations.find((entry) => entry?.name === configName);
if (config === undefined) {
  throw new Error(`Launch configuration not found: ${configName}`);
}

const replaceWorkspaceFolder = (value) =>
  value.replaceAll('${workspaceFolder}', workspaceFolder);

const resolvedArgs = (config.args ?? []).map((value) => {
  if (typeof value !== 'string') {
    throw new Error(`Launch configuration args must be strings: ${configName}`);
  }
  return replaceWorkspaceFolder(value);
});

if (resolvedArgs[0] !== 'tokamak-ch-tx') {
  throw new Error(
    `Launch configuration ${configName} must start with "tokamak-ch-tx", got ${String(resolvedArgs[0])}`
  );
}

const resolvedCwd =
  typeof config.cwd === 'string' ? replaceWorkspaceFolder(config.cwd) : workspaceFolder;
const command = tokamakCli;
const commandArgs = ['--synthesize', '--tokamak-ch-tx', ...resolvedArgs.slice(1)];

if (dryRun) {
  console.log(JSON.stringify({ command, args: commandArgs, cwd: resolvedCwd }, null, 2));
  process.exit(0);
}

const child = spawn(command, commandArgs, {
  cwd: resolvedCwd,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
