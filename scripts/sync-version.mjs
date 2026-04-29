#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetVersion = process.argv[2] ?? process.env.TOKAMAK_ZK_EVM_VERSION;
const strictSemverPattern = /^\d+\.\d+\.\d+$/u;

if (!targetVersion || !strictSemverPattern.test(targetVersion)) {
  console.error('Usage: node scripts/sync-version.mjs <X.Y.Z>');
  process.exit(1);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function updateJson(relativePath, updater, { optional = false } = {}) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    if (optional) {
      return;
    }
    throw new Error(`Missing version target: ${relativePath}`);
  }

  const manifest = readJson(relativePath);
  updater(manifest);
  writeJson(relativePath, manifest);
}

function updatePackageVersion(relativePath, dependencyUpdates = {}) {
  updateJson(relativePath, manifest => {
    manifest.version = targetVersion;

    for (const [dependencyName, dependencyRange] of Object.entries(dependencyUpdates)) {
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        if (manifest[field]?.[dependencyName] !== undefined) {
          manifest[field][dependencyName] = dependencyRange;
        }
      }
    }
  });
}

function updateBackendWorkspaceVersion() {
  const relativePath = 'packages/backend/Cargo.toml';
  const absolutePath = path.join(repoRoot, relativePath);
  const original = fs.readFileSync(absolutePath, 'utf8');
  const versionPattern = /(\[workspace\.package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/u;
  if (!versionPattern.test(original)) {
    throw new Error(`Could not find [workspace.package] version in ${relativePath}`);
  }
  const updated = original.replace(versionPattern, `$1"${targetVersion}"`);

  fs.writeFileSync(absolutePath, updated, 'utf8');
}

function updateBackendCargoLock() {
  const relativePath = 'packages/backend/Cargo.lock';
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return;
  }

  const workspacePackages = new Set(['libs', 'mpc-setup', 'preprocess', 'prove', 'trusted-setup', 'verify']);
  const original = fs.readFileSync(absolutePath, 'utf8');
  const updated = original.replace(/\[\[package\]\]\n([\s\S]*?)(?=\n\[\[package\]\]|\s*$)/gu, block => {
    const nameMatch = /^name = "([^"]+)"/mu.exec(block);
    if (!nameMatch || !workspacePackages.has(nameMatch[1])) {
      return block;
    }
    return block.replace(/^version = "[^"]+"/mu, `version = "${targetVersion}"`);
  });

  fs.writeFileSync(absolutePath, updated, 'utf8');
}

function updatePackageLock(relativePath, updater, { optional = false } = {}) {
  updateJson(relativePath, updater, { optional });
}

function updateRootPackageLock() {
  updatePackageLock(
    'package-lock.json',
    lockfile => {
      lockfile.version = targetVersion;
      if (lockfile.packages?.['']) {
        lockfile.packages[''].version = targetVersion;
      }
      if (lockfile.packages?.['packages/cli']) {
        lockfile.packages['packages/cli'].version = targetVersion;
        lockfile.packages['packages/cli'].dependencies['@tokamak-zk-evm/synthesizer-node'] = `^${targetVersion}`;
      }
      if (lockfile.packages?.['packages/frontend/qap-compiler']) {
        lockfile.packages['packages/frontend/qap-compiler'].version = targetVersion;
      }
      if (lockfile.packages?.['packages/frontend/synthesizer/node-cli']) {
        lockfile.packages['packages/frontend/synthesizer/node-cli'].version = targetVersion;
        lockfile.packages['packages/frontend/synthesizer/node-cli'].dependencies['@tokamak-zk-evm/subcircuit-library'] =
          `^${targetVersion}`;
      }
      if (lockfile.packages?.['packages/frontend/synthesizer/web-app']) {
        lockfile.packages['packages/frontend/synthesizer/web-app'].version = targetVersion;
        lockfile.packages['packages/frontend/synthesizer/web-app'].dependencies['@tokamak-zk-evm/subcircuit-library'] =
          `^${targetVersion}`;
      }
    },
    { optional: true },
  );
}

function updateQapCompilerPackageLock() {
  updatePackageLock(
    'packages/frontend/qap-compiler/package-lock.json',
    lockfile => {
      lockfile.version = targetVersion;
      if (lockfile.packages?.['']) {
        lockfile.packages[''].version = targetVersion;
      }
    },
    { optional: true },
  );
}

function updateSynthesizerPackageLock() {
  updatePackageLock(
    'packages/frontend/synthesizer/package-lock.json',
    lockfile => {
      for (const packageKey of ['node-cli', 'web-app']) {
        if (!lockfile.packages?.[packageKey]) {
          continue;
        }
        lockfile.packages[packageKey].version = targetVersion;
        lockfile.packages[packageKey].dependencies['@tokamak-zk-evm/subcircuit-library'] = `^${targetVersion}`;
      }
    },
    { optional: true },
  );

  updatePackageLock(
    'packages/frontend/synthesizer/node-cli/package-lock.json',
    lockfile => {
      lockfile.version = targetVersion;
      if (lockfile.packages?.['']) {
        lockfile.packages[''].version = targetVersion;
        lockfile.packages[''].dependencies['@tokamak-zk-evm/subcircuit-library'] = `^${targetVersion}`;
      }
    },
    { optional: true },
  );

  updatePackageLock(
    'packages/frontend/synthesizer/web-app/package-lock.json',
    lockfile => {
      lockfile.version = targetVersion;
      if (lockfile.packages?.['']) {
        lockfile.packages[''].version = targetVersion;
        lockfile.packages[''].dependencies ??= {};
        lockfile.packages[''].dependencies['@tokamak-zk-evm/subcircuit-library'] = `^${targetVersion}`;
      }
    },
    { optional: true },
  );
}

updatePackageVersion('package.json');
updatePackageVersion('packages/cli/package.json', {
  '@tokamak-zk-evm/synthesizer-node': `^${targetVersion}`,
});
updatePackageVersion('packages/frontend/qap-compiler/package.json');
updatePackageVersion('packages/frontend/qap-compiler/dist/package.json', {}, { optional: true });
updatePackageVersion('packages/frontend/synthesizer/node-cli/package.json', {
  '@tokamak-zk-evm/subcircuit-library': `^${targetVersion}`,
});
updatePackageVersion('packages/frontend/synthesizer/web-app/package.json', {
  '@tokamak-zk-evm/subcircuit-library': `^${targetVersion}`,
});
updateBackendWorkspaceVersion();
updateBackendCargoLock();
updateRootPackageLock();
updateQapCompilerPackageLock();
updateSynthesizerPackageLock();

console.log(`[sync-version] Synchronized repository release version to ${targetVersion}.`);
