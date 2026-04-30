#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`[version-check] ${message}`);
  process.exitCode = 1;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function getBackendWorkspaceVersion() {
  const manifest = readText('packages/backend/Cargo.toml');
  const match = /\[workspace\.package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/u.exec(manifest);
  return match?.[1] ?? null;
}

function getCargoLockPackageVersions() {
  if (!fileExists('packages/backend/Cargo.lock')) {
    return new Map();
  }

  const workspacePackages = new Set(['libs', 'mpc-setup', 'preprocess', 'prove', 'trusted-setup', 'verify']);
  const versions = new Map();
  const lockfile = readText('packages/backend/Cargo.lock');

  for (const block of lockfile.matchAll(/\[\[package\]\]\n([\s\S]*?)(?=\n\[\[package\]\]|\s*$)/gu)) {
    const name = /^name = "([^"]+)"/mu.exec(block[1])?.[1];
    const version = /^version = "([^"]+)"/mu.exec(block[1])?.[1];
    if (name && workspacePackages.has(name)) {
      versions.set(name, version);
    }
  }

  return versions;
}

const rootManifest = readJson('package.json');
const expectedVersion = rootManifest.version;
const strictSemverPattern = /^\d+\.\d+\.\d+$/u;

if (!strictSemverPattern.test(expectedVersion)) {
  fail(`Root package.json version must be strict semver, got '${expectedVersion}'.`);
}

const packageTargets = [
  'packages/cli/package.json',
  'packages/frontend/qap-compiler/package.json',
  'packages/frontend/qap-compiler/dist/package.json',
  'packages/frontend/synthesizer/node-cli/package.json',
  'packages/frontend/synthesizer/web-app/package.json',
];

for (const relativePath of packageTargets) {
  if (!fileExists(relativePath)) {
    continue;
  }
  const manifest = readJson(relativePath);
  if (manifest.version !== expectedVersion) {
    fail(`${relativePath} version is '${manifest.version}', expected '${expectedVersion}'.`);
  }
}

const dependencyTargets = [
  ['packages/cli/package.json', '@tokamak-zk-evm/synthesizer-node', `^${expectedVersion}`],
  ['packages/frontend/synthesizer/node-cli/package.json', '@tokamak-zk-evm/subcircuit-library', `^${expectedVersion}`],
  ['packages/frontend/synthesizer/web-app/package.json', '@tokamak-zk-evm/subcircuit-library', `^${expectedVersion}`],
];

for (const [relativePath, dependencyName, expectedRange] of dependencyTargets) {
  const manifest = readJson(relativePath);
  const actualRange = manifest.dependencies?.[dependencyName];
  if (actualRange !== expectedRange) {
    fail(`${relativePath} dependency ${dependencyName} is '${actualRange}', expected '${expectedRange}'.`);
  }
}

const lockfileTargets = [
  ['package-lock.json', '', expectedVersion],
  ['package-lock.json', 'packages/cli', expectedVersion],
  ['package-lock.json', 'packages/frontend/qap-compiler', expectedVersion],
  ['package-lock.json', 'packages/frontend/synthesizer/node-cli', expectedVersion],
  ['package-lock.json', 'packages/frontend/synthesizer/web-app', expectedVersion],
  ['packages/frontend/qap-compiler/package-lock.json', '', expectedVersion],
  ['packages/frontend/synthesizer/package-lock.json', 'node-cli', expectedVersion],
  ['packages/frontend/synthesizer/package-lock.json', 'web-app', expectedVersion],
  ['packages/frontend/synthesizer/node-cli/package-lock.json', '', expectedVersion],
  ['packages/frontend/synthesizer/web-app/package-lock.json', '', expectedVersion],
];

for (const [relativePath, packageKey, expectedPackageVersion] of lockfileTargets) {
  if (!fileExists(relativePath)) {
    continue;
  }
  const lockfile = readJson(relativePath);
  const packageEntry = lockfile.packages?.[packageKey];
  const actualVersion = packageKey === '' ? (packageEntry?.version ?? lockfile.version) : packageEntry?.version;
  if (actualVersion !== expectedPackageVersion) {
    fail(`${relativePath} package entry '${packageKey}' is '${actualVersion}', expected '${expectedPackageVersion}'.`);
  }
}

const backendVersion = getBackendWorkspaceVersion();
if (backendVersion !== expectedVersion) {
  fail(`packages/backend/Cargo.toml workspace version is '${backendVersion}', expected '${expectedVersion}'.`);
}

const cliManifest = readJson('packages/cli/package.json');
const compatibleBackendVersion = cliManifest.tokamakZkEvm?.compatibleBackendVersion;
const compatibleVersionPattern = /^(\d+)\.(\d+)$/u;
const expectedCompatibleBackendVersion = expectedVersion.split('.').slice(0, 2).join('.');

if (!compatibleVersionPattern.test(String(compatibleBackendVersion ?? ''))) {
  fail(
    `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion must be strict MAJOR.MINOR, got '${compatibleBackendVersion}'.`,
  );
} else if (compatibleBackendVersion !== expectedCompatibleBackendVersion) {
  fail(
    `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion is '${compatibleBackendVersion}', expected '${expectedCompatibleBackendVersion}' from package version '${expectedVersion}'.`,
  );
}

for (const [name, version] of getCargoLockPackageVersions()) {
  if (version !== expectedVersion) {
    fail(`packages/backend/Cargo.lock package ${name} is '${version}', expected '${expectedVersion}'.`);
  }
}

if (!fileExists('CHANGELOG.md')) {
  fail('Root CHANGELOG.md is missing.');
} else {
  const changelog = readText('CHANGELOG.md');
  if (
    !new RegExp(`^## \\[${expectedVersion.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'mu').test(changelog)
  ) {
    fail(`Root CHANGELOG.md must contain a release entry for ${expectedVersion}.`);
  }
}

if (process.exitCode) {
  process.exit();
}

console.log(`[version-check] Repository release version is synchronized at ${expectedVersion}.`);
