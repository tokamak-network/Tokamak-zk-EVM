#!/usr/bin/env node

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const compileScript = path.resolve(packageRoot, 'scripts/compile.sh');
const reloadScript = path.resolve(packageRoot, 'scripts/reload-constants.sh');

const printHelp = () => {
  console.log(`Usage:
  qap-compiler --build [output-dir]
  qap-compiler --reload-constants
  qap-compiler --help`);
};

const runScript = (scriptPath, args) => {
  const result = spawnSync(scriptPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  console.error(`Failed to execute '${scriptPath}'.`);
  process.exit(1);
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

  const compileArgs = [];
  if (args[1] !== undefined) {
    compileArgs.push(path.resolve(process.cwd(), args[1]));
  }

  runScript(compileScript, compileArgs);
}

console.error(`Error: Unknown command '${args[0]}'.`);
printHelp();
process.exit(1);
