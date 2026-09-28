#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compatibilityFromPackageVersion, parsePackageVersion } from './version-contract.mjs';
import {
  BACKEND_CARGO_LOCK,
  BACKEND_WORKSPACE_MANIFEST,
  BACKEND_WORKSPACE_PACKAGE_NAMES,
  LOCKFILE_DEPENDENCY_TARGETS,
  LOCKFILE_PACKAGE_VERSION_TARGETS,
  OPTIONAL_LOCKFILES,
  SOURCE_PACKAGE_VERSION_TARGETS,
  SYNCHRONIZED_DEPENDENCY_TARGETS,
  VERSION_CONSTANT_TARGETS,
} from './version-targets.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argumentsList = process.argv.slice(2);
const sourceOnly = argumentsList.includes('--source-only');
const targetVersion =
  argumentsList.find(argument => argument !== '--source-only') ?? process.env.TOKAMAK_ZK_EVM_VERSION;

if (!targetVersion) {
  console.error('Usage: node scripts/sync-version.mjs [--source-only] <X.Y.Z>');
  process.exit(1);
}

try {
  parsePackageVersion(targetVersion);
  const transaction = createVersionTransaction(
    repositoryRoot,
    targetVersion,
    compatibilityFromPackageVersion(targetVersion),
    sourceOnly,
  );
  commitVersionTransaction(transaction);
  console.log(
    sourceOnly
      ? `[sync-version] Synchronized source version to ${targetVersion} without lockfiles or generated artifacts.`
      : `[sync-version] Synchronized repository release version to ${targetVersion}.`,
  );
} catch (error) {
  console.error(`[sync-version] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

/**
 * @param {string} root
 * @param {string} version
 * @param {string} compatibleBackendVersion
 * @param {boolean} onlySource
 */
function createVersionTransaction(root, version, compatibleBackendVersion, onlySource) {
  /** @type {Map<string, { absolutePath: string, original: string, updated: string }>} */
  const changes = new Map();

  /** @param {string} relativePath */
  function readOriginal(relativePath) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing version target: ${relativePath}`);
    }
    return fs.readFileSync(absolutePath, 'utf8');
  }

  /**
   * @param {string} relativePath
   * @param {(contents: string) => string} updater
   */
  function stageText(relativePath, updater) {
    const existing = changes.get(relativePath);
    const original = existing?.original ?? readOriginal(relativePath);
    const current = existing?.updated ?? original;
    const updated = updater(current);
    if (typeof updated !== 'string') {
      throw new Error(`Version updater for ${relativePath} did not return text.`);
    }
    changes.set(relativePath, {
      absolutePath: path.join(root, relativePath),
      original,
      updated,
    });
  }

  /**
   * @param {string} relativePath
   * @param {(value: any) => void} updater
   */
  function stageJson(relativePath, updater) {
    stageText(relativePath, contents => {
      let value;
      try {
        value = JSON.parse(contents);
      } catch (error) {
        throw new Error(
          `Invalid JSON in version target ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      updater(value);
      return `${JSON.stringify(value, null, 2)}\n`;
    });
  }

  for (const relativePath of SOURCE_PACKAGE_VERSION_TARGETS) {
    stageJson(relativePath, manifest => {
      if (typeof manifest.version !== 'string') {
        throw new Error(`Missing string version in ${relativePath}.`);
      }
      manifest.version = version;
    });
  }

  for (const [relativePath, dependencyName] of SYNCHRONIZED_DEPENDENCY_TARGETS) {
    stageJson(relativePath, manifest => {
      const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
      const matchingFields = fields.filter(field => manifest[field]?.[dependencyName] !== undefined);
      if (matchingFields.length !== 1) {
        throw new Error(
          `${relativePath} must declare ${dependencyName} in exactly one dependency field; found ${matchingFields.length}.`,
        );
      }
      manifest[matchingFields[0]][dependencyName] = version;
    });
  }

  stageJson('packages/cli/package.json', manifest => {
    if (typeof manifest.tokamakZkEvm?.compatibleBackendVersion !== 'string') {
      throw new Error('packages/cli/package.json is missing tokamakZkEvm.compatibleBackendVersion.');
    }
    manifest.tokamakZkEvm.compatibleBackendVersion = compatibleBackendVersion;
  });

  stageText(BACKEND_WORKSPACE_MANIFEST, contents => {
    const pattern = /(\[workspace\.package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/u;
    if (!pattern.test(contents)) {
      throw new Error(`Could not find [workspace.package] version in ${BACKEND_WORKSPACE_MANIFEST}.`);
    }
    return contents.replace(pattern, `$1"${version}"`);
  });

  for (const [relativePath, constantName] of VERSION_CONSTANT_TARGETS) {
    stageText(relativePath, contents => {
      const pattern = new RegExp(`(${constantName}\\s*=\\s*)"[^"]+"`, 'u');
      if (!pattern.test(contents)) {
        throw new Error(`Could not find ${constantName} in ${relativePath}.`);
      }
      return contents.replace(pattern, `$1"${version}"`);
    });
  }

  if (!onlySource) {
    const lockfilePaths = new Set([
      ...LOCKFILE_PACKAGE_VERSION_TARGETS.map(([relativePath]) => relativePath),
      ...LOCKFILE_DEPENDENCY_TARGETS.map(([relativePath]) => relativePath),
    ]);
    for (const relativePath of lockfilePaths) {
      if (!fs.existsSync(path.join(root, relativePath))) {
        if (OPTIONAL_LOCKFILES.has(relativePath)) {
          continue;
        }
        throw new Error(`Missing version target: ${relativePath}`);
      }
      stageJson(relativePath, lockfile => {
        for (const [targetPath, packageKey] of LOCKFILE_PACKAGE_VERSION_TARGETS) {
          if (targetPath !== relativePath) continue;
          const packageEntry = lockfile.packages?.[packageKey];
          if (packageEntry === undefined) {
            throw new Error(`${relativePath} is missing package entry ${JSON.stringify(packageKey)}.`);
          }
          packageEntry.version = version;
          if (packageKey === '' && typeof lockfile.version === 'string') {
            lockfile.version = version;
          }
        }
        for (const [targetPath, packageKey, dependencyName] of LOCKFILE_DEPENDENCY_TARGETS) {
          if (targetPath !== relativePath) continue;
          const dependencies = lockfile.packages?.[packageKey]?.dependencies;
          if (dependencies?.[dependencyName] === undefined) {
            throw new Error(
              `${relativePath} package entry ${JSON.stringify(packageKey)} is missing dependency ${dependencyName}.`,
            );
          }
          dependencies[dependencyName] = version;
        }
      });
    }

    stageText(BACKEND_CARGO_LOCK, contents => updateCargoLock(contents, version));
  }

  return [...changes.values()].filter(change => change.updated !== change.original);
}

/**
 * @param {string} contents
 * @param {string} version
 */
function updateCargoLock(contents, version) {
  const foundPackages = new Set();
  const workspacePackages = new Set(BACKEND_WORKSPACE_PACKAGE_NAMES);
  const updated = contents.replace(/\[\[package\]\]\n([\s\S]*?)(?=\n\[\[package\]\]|\s*$)/gu, block => {
    const name = /^name = "([^"]+)"/mu.exec(block)?.[1];
    if (name === undefined || !workspacePackages.has(name)) {
      return block;
    }
    if (!/^version = "[^"]+"/mu.test(block)) {
      throw new Error(`${BACKEND_CARGO_LOCK} package ${name} is missing its version.`);
    }
    foundPackages.add(name);
    return block.replace(/^version = "[^"]+"/mu, `version = "${version}"`);
  });
  const missingPackages = BACKEND_WORKSPACE_PACKAGE_NAMES.filter(name => !foundPackages.has(name));
  if (missingPackages.length > 0) {
    throw new Error(`${BACKEND_CARGO_LOCK} is missing workspace packages: ${missingPackages.join(', ')}.`);
  }
  return updated;
}

/** @param {Array<{ absolutePath: string, original: string, updated: string }>} transaction */
function commitVersionTransaction(transaction) {
  const configuredFailure = process.env.TOKAMAK_ZK_EVM_SYNC_TEST_FAIL_AFTER_WRITES;
  if (configuredFailure !== undefined && process.env.NODE_ENV !== 'test') {
    throw new Error('TOKAMAK_ZK_EVM_SYNC_TEST_FAIL_AFTER_WRITES is available only when NODE_ENV=test.');
  }
  const failAfterWrites = configuredFailure === undefined ? null : Number(configuredFailure);
  if (failAfterWrites !== null && (!Number.isInteger(failAfterWrites) || failAfterWrites < 0)) {
    throw new Error('TOKAMAK_ZK_EVM_SYNC_TEST_FAIL_AFTER_WRITES must be a non-negative integer.');
  }

  /** @type {typeof transaction} */
  const attempted = [];
  try {
    for (const change of transaction) {
      if (failAfterWrites !== null && attempted.length === failAfterWrites) {
        throw new Error(`Injected write failure after ${attempted.length} writes.`);
      }
      attempted.push(change);
      fs.writeFileSync(change.absolutePath, change.updated, 'utf8');
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const change of attempted.reverse()) {
      try {
        fs.writeFileSync(change.absolutePath, change.original, 'utf8');
      } catch (rollbackError) {
        rollbackErrors.push(
          `${change.absolutePath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
    }
    const cause = error instanceof Error ? error.message : String(error);
    if (rollbackErrors.length > 0) {
      throw new Error(`${cause} Rollback also failed: ${rollbackErrors.join('; ')}`);
    }
    throw new Error(`${cause} All attempted writes were rolled back.`);
  }
}
