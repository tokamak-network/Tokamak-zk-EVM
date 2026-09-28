#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePackageVersion } from './version-contract.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendWasmRoot = path.join(repositoryRoot, 'packages', 'backend', 'wasm');
const lockfilePath = path.join(backendWasmRoot, 'package-lock.json');
const rootManifest = readJson(path.join(repositoryRoot, 'package.json'));
const backendManifest = readJson(path.join(backendWasmRoot, 'package.json'));
const packageName = '@tokamak-zk-evm/subcircuit-library';
const expectedVersion = rootManifest.version;
const declaredVersion = backendManifest.dependencies?.[packageName];

parsePackageVersion(expectedVersion);
if (declaredVersion !== expectedVersion) {
  throw new Error(
    `${path.relative(repositoryRoot, path.join(backendWasmRoot, 'package.json'))} declares ${packageName}@${JSON.stringify(declaredVersion)}, expected ${expectedVersion}.`,
  );
}

const originalLockfile = fs.readFileSync(lockfilePath);
try {
  const registryOption = '--registry=https://registry.npmjs.org';
  runNpm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', registryOption]);
  runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund', registryOption]);
  runNpm(['run', 'subcircuit-library:generate:production']);
  execFileSync(process.execPath, [path.join(repositoryRoot, 'scripts', 'check-production-snapshot.mjs')], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  console.log(`[production-snapshot-refresh] Refreshed and validated ${packageName}@${expectedVersion}.`);
} catch (error) {
  fs.writeFileSync(lockfilePath, originalLockfile);
  console.error('[production-snapshot-refresh] Restored the tracked lockfile after refresh failure.');
  throw error;
}

/** @param {string[]} argumentsList */
function runNpm(argumentsList) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCommand, argumentsList, { cwd: backendWasmRoot, stdio: 'inherit' });
}

/** @param {string} filePath */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
