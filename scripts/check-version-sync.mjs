#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compatibilityFromPackageVersion,
  parseCompatibleBackendVersion,
  parsePackageVersion,
} from './version-contract.mjs';
import {
  BACKEND_CARGO_LOCK,
  BACKEND_WORKSPACE_MANIFEST,
  BACKEND_WORKSPACE_PACKAGE_NAMES,
  LOCKFILE_DEPENDENCY_TARGETS,
  LOCKFILE_PACKAGE_VERSION_TARGETS,
  SOURCE_PACKAGE_VERSION_TARGETS,
  SYNCHRONIZED_DEPENDENCY_TARGETS,
  VERSION_CONSTANT_TARGETS,
} from './version-targets.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceOnly = process.argv.slice(2).includes('--source-only');
const prePublication = process.argv.slice(2).includes('--pre-publication');

if (sourceOnly && prePublication) {
  console.error('[version-check] --source-only and --pre-publication are mutually exclusive.');
  process.exit(1);
}

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
  const manifest = readText(BACKEND_WORKSPACE_MANIFEST);
  const match = /\[workspace\.package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/u.exec(manifest);
  return match?.[1] ?? null;
}

function getCargoLockPackageVersions() {
  if (!fileExists(BACKEND_CARGO_LOCK)) {
    return new Map();
  }

  const workspacePackages = new Set(BACKEND_WORKSPACE_PACKAGE_NAMES);
  const versions = new Map();
  const lockfile = readText(BACKEND_CARGO_LOCK);

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
let expectedCompatibleBackendVersion = null;

try {
  expectedCompatibleBackendVersion = compatibilityFromPackageVersion(expectedVersion);
} catch (error) {
  fail(`Root package.json version ${error.message}`);
}

const packageTargets = SOURCE_PACKAGE_VERSION_TARGETS.filter(relativePath => relativePath !== 'package.json');

for (const relativePath of packageTargets) {
  if (!fileExists(relativePath)) {
    continue;
  }
  const manifest = readJson(relativePath);
  if (manifest.version !== expectedVersion) {
    fail(`${relativePath} version is '${manifest.version}', expected '${expectedVersion}'.`);
  }
}

const dependencyTargets = SYNCHRONIZED_DEPENDENCY_TARGETS.map(([relativePath, dependencyName]) => [
  relativePath,
  dependencyName,
  expectedVersion,
]);

for (const [relativePath, dependencyName, expectedRange] of dependencyTargets) {
  const manifest = readJson(relativePath);
  const actualRange = manifest.dependencies?.[dependencyName];
  if (actualRange !== expectedRange) {
    fail(`${relativePath} dependency ${dependencyName} is '${actualRange}', expected '${expectedRange}'.`);
  }
}

const lockfileTargets = LOCKFILE_PACKAGE_VERSION_TARGETS.map(([relativePath, packageKey]) => [
  relativePath,
  packageKey,
  expectedVersion,
]);

if (!sourceOnly) {
  for (const [relativePath, packageKey, expectedPackageVersion] of lockfileTargets) {
    if (!fileExists(relativePath)) {
      continue;
    }
    const lockfile = readJson(relativePath);
    const packageEntry = lockfile.packages?.[packageKey];
    const actualVersion = packageKey === '' ? (packageEntry?.version ?? lockfile.version) : packageEntry?.version;
    if (actualVersion !== expectedPackageVersion) {
      fail(
        `${relativePath} package entry '${packageKey}' is '${actualVersion}', expected '${expectedPackageVersion}'.`,
      );
    }
  }

  const backendWasmPackageLock = readJson('packages/backend/wasm/package-lock.json');
  for (const [relativePath, packageKey, dependencyName] of LOCKFILE_DEPENDENCY_TARGETS) {
    if (!fileExists(relativePath)) continue;
    const lockfile = readJson(relativePath);
    const actualRange = lockfile.packages?.[packageKey]?.dependencies?.[dependencyName];
    if (actualRange !== expectedVersion) {
      fail(
        `${relativePath} package entry '${packageKey}' dependency ${dependencyName} is '${actualRange}', expected '${expectedVersion}'.`,
      );
    }
  }

  if (!prePublication) {
    const backendWasmResolvedSubcircuitVersion =
      backendWasmPackageLock.packages?.['node_modules/@tokamak-zk-evm/subcircuit-library']?.version;
    if (backendWasmResolvedSubcircuitVersion !== expectedVersion) {
      fail(
        `packages/backend/wasm/package-lock.json resolved @tokamak-zk-evm/subcircuit-library is '${backendWasmResolvedSubcircuitVersion ?? 'missing'}', expected '${expectedVersion}'.`,
      );
    }
  }
}

for (const [relativePath, constantName] of VERSION_CONSTANT_TARGETS) {
  const moduleContents = readText(relativePath);
  const match = new RegExp(`${constantName}\\s*=\\s*"([^"]+)"`, 'u').exec(moduleContents);
  if (match?.[1] !== expectedVersion) {
    fail(`${relativePath} ${constantName} is '${match?.[1] ?? 'missing'}', expected '${expectedVersion}'.`);
  }
}

// backend-wasm active generated inputs are ignored, mode-specific build
// products. Its build and generated-input checks own their version validation;
// the repository source policy must remain valid in a fresh checkout.

const backendVersion = getBackendWorkspaceVersion();
if (backendVersion !== expectedVersion) {
  fail(`packages/backend/Cargo.toml workspace version is '${backendVersion}', expected '${expectedVersion}'.`);
}

const cliManifest = readJson('packages/cli/package.json');
const compatibleBackendVersion = cliManifest.tokamakZkEvm?.compatibleBackendVersion;

try {
  parseCompatibleBackendVersion(compatibleBackendVersion);
} catch (error) {
  fail(`packages/cli/package.json tokamakZkEvm.compatibleBackendVersion ${error.message}`);
}
if (compatibleBackendVersion !== expectedCompatibleBackendVersion) {
  fail(
    `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion is '${compatibleBackendVersion}', expected '${expectedCompatibleBackendVersion}' from package version '${expectedVersion}'.`,
  );
}

if (!sourceOnly) {
  if (!fileExists(BACKEND_CARGO_LOCK)) {
    fail(`${BACKEND_CARGO_LOCK} is missing.`);
  }
  const cargoLockPackageVersions = getCargoLockPackageVersions();
  for (const name of BACKEND_WORKSPACE_PACKAGE_NAMES) {
    if (!cargoLockPackageVersions.has(name)) {
      fail(`${BACKEND_CARGO_LOCK} is missing workspace package ${name}.`);
    }
  }
  for (const [name, version] of cargoLockPackageVersions) {
    if (version !== expectedVersion) {
      fail(`packages/backend/Cargo.lock package ${name} is '${version}', expected '${expectedVersion}'.`);
    }
  }
}

if (process.exitCode) {
  process.exit();
}

console.log(
  sourceOnly
    ? `[version-check] Source version is synchronized at ${expectedVersion}; lockfiles and generated artifacts are intentionally excluded.`
    : prePublication
      ? `[version-check] Pre-publication source and declared lock versions are synchronized at ${expectedVersion}; the unpublished production snapshot is intentionally excluded.`
      : `[version-check] Repository release version is synchronized at ${expectedVersion}.`,
);
