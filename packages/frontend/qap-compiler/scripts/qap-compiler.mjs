#!/usr/bin/env node

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const compileScript = path.resolve(packageRoot, 'scripts/compile.sh');
const reloadScript = path.resolve(packageRoot, 'scripts/reload-constants.sh');
const distScript = path.resolve(packageRoot, 'scripts/dist-package.mjs');
const expectedCircomVersion = process.env.QAP_COMPILER_EXPECTED_CIRCOM_VERSION ?? null;

const printHelp = () => {
  console.log(`Usage:
  qap-compiler --build [output-dir]
  qap-compiler --reload-constants
  qap-compiler --dist
  qap-compiler --help`);
};

const runScript = (scriptPath, args, command = scriptPath, extraEnv = {}) => {
  const result = spawnSync(scriptPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: 'inherit',
  });

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  console.error(`Failed to execute '${command}'.`);
  process.exit(1);
};

const parseCircomVersion = rawVersion => rawVersion.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;

const failCircomResolution = () => {
  console.error('Error: No usable Circom compiler was found.');
  console.error("Install official 'circom' on your system PATH before running qap-compiler --build.");
  process.exit(1);
};

const resolveCircomCommand = () => {
  const systemCircom = spawnSync('circom', ['--version'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (systemCircom.status === 0) {
    const rawVersion = `${systemCircom.stdout}${systemCircom.stderr}`.trim();
    const version = parseCircomVersion(rawVersion);
    if (expectedCircomVersion !== null && version !== expectedCircomVersion) {
      console.error(
        `Error: Expected circom ${expectedCircomVersion}, but found '${rawVersion || 'unknown version'}'.`,
      );
      process.exit(1);
    }

    console.log(
      `[qap-compiler] Using system circom from PATH${rawVersion ? ` (${rawVersion})` : ''}.`,
    );
    return {
      command: 'circom',
      extraEnv: {},
    };
  }

  failCircomResolution();
};

if (process.platform !== 'darwin' && process.platform !== 'linux') {
  console.error('qap-compiler supports only macOS and Linux.');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  printHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

if (args[0] === '--reload-constants') {
  if (args.length !== 1) {
    console.error('Error: --reload-constants does not accept additional arguments.');
    printHelp();
    process.exit(1);
  }

  runScript(reloadScript, []);
}

if (args[0] === '--build') {
  if (args.length > 2) {
    console.error('Error: --build accepts at most one output directory.');
    printHelp();
    process.exit(1);
  }

  const circomCommand = resolveCircomCommand();
  const compileArgs = [circomCommand.command];
  if (args[1] !== undefined) {
    compileArgs.push(path.resolve(process.cwd(), args[1]));
  }

  runScript(compileScript, compileArgs, compileScript, circomCommand.extraEnv);
}

if (args[0] === '--dist') {
  if (args.length !== 1) {
    console.error('Error: --dist does not accept additional arguments.');
    printHelp();
    process.exit(1);
  }

  runScript(process.execPath, [distScript], 'node scripts/dist-package.mjs');
}

console.error(`Error: Unknown command '${args[0]}'.`);
printHelp();
process.exit(1);
