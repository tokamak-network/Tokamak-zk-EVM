#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureFiles = new Set([
  ...SOURCE_PACKAGE_VERSION_TARGETS,
  ...SYNCHRONIZED_DEPENDENCY_TARGETS.map(([relativePath]) => relativePath),
  ...LOCKFILE_PACKAGE_VERSION_TARGETS.map(([relativePath]) => relativePath),
  ...LOCKFILE_DEPENDENCY_TARGETS.map(([relativePath]) => relativePath),
  ...VERSION_CONSTANT_TARGETS.map(([relativePath]) => relativePath),
  BACKEND_WORKSPACE_MANIFEST,
  BACKEND_CARGO_LOCK,
  'scripts/check-version-sync.mjs',
  'scripts/sync-version.mjs',
  'scripts/version-contract.mjs',
  'scripts/version-contract.d.ts',
  'scripts/version-targets.mjs',
]);

await runTest('source-only synchronization succeeds in a fresh fixture', fixtureRoot => {
  const initialLockVersion = readJson(fixtureRoot, 'package-lock.json').version;
  run(fixtureRoot, ['scripts/sync-version.mjs', '--source-only', '3.0.0']);
  run(fixtureRoot, ['scripts/check-version-sync.mjs', '--source-only']);
  assert.equal(readJson(fixtureRoot, 'package.json').version, '3.0.0');
  assert.equal(readJson(fixtureRoot, 'package-lock.json').version, initialLockVersion);
  assert.equal(fs.existsSync(path.join(fixtureRoot, 'packages/backend/wasm/src/generated/active')), false);
});

await runTest('complete synchronization excludes ignored generated inputs', fixtureRoot => {
  run(fixtureRoot, ['scripts/sync-version.mjs', '3.0.0']);
  run(fixtureRoot, ['scripts/check-version-sync.mjs', '--pre-publication']);
  assert.equal(readJson(fixtureRoot, 'package.json').version, '3.0.0');
  assert.equal(readJson(fixtureRoot, 'packages/backend/wasm/package-lock.json').version, '3.0.0');
  assert.equal(readCargoPackageVersion(fixtureRoot, 'backend-interface'), '3.0.0');
  assert.equal(fs.existsSync(path.join(fixtureRoot, 'packages/backend/wasm/src/generated/active')), false);

  run(fixtureRoot, ['scripts/check-version-sync.mjs']);
});

await runTest('complete synchronization leaves real backend workspace metadata locked', fixtureRoot => {
  copyTrackedBackendWorkspace(fixtureRoot);
  copyFile(fixtureRoot, 'rust-toolchain.toml');
  run(fixtureRoot, ['scripts/sync-version.mjs', '3.0.0']);

  execFileSync(
    'cargo',
    [
      'metadata',
      '--locked',
      '--no-deps',
      '--format-version',
      '1',
      '--manifest-path',
      'packages/backend/Cargo.toml',
    ],
    { cwd: fixtureRoot, encoding: 'utf8', stdio: 'pipe' },
  );

  for (const packageName of BACKEND_WORKSPACE_PACKAGE_NAMES) {
    assert.equal(readCargoPackageVersion(fixtureRoot, packageName), '3.0.0');
  }
});

await runTest('complete synchronization requires the backend workspace lock', fixtureRoot => {
  fs.rmSync(path.join(fixtureRoot, BACKEND_CARGO_LOCK));
  const before = snapshot(fixtureRoot);
  const result = runFailure(fixtureRoot, ['scripts/sync-version.mjs', '3.0.0']);
  assert.match(result.stderr, /Missing version target: packages\/backend\/Cargo\.lock/u);
  assert.deepEqual(snapshot(fixtureRoot), before);
});

await runTest('missing targets fail before any write', fixtureRoot => {
  fs.rmSync(path.join(fixtureRoot, 'packages/frontend/synthesizer/web-app/package.json'));
  const before = snapshot(fixtureRoot);
  const result = runFailure(fixtureRoot, ['scripts/sync-version.mjs', '--source-only', '3.0.0']);
  assert.match(result.stderr, /Missing version target/u);
  assert.deepEqual(snapshot(fixtureRoot), before);
});

await runTest('malformed targets fail before any write', fixtureRoot => {
  const relativePath = 'packages/backend/wasm/src/version.ts';
  fs.writeFileSync(
    path.join(fixtureRoot, relativePath),
    'export const DIFFERENT_VERSION_CONSTANT = "2.1.5";\n',
    'utf8',
  );
  const before = snapshot(fixtureRoot);
  const result = runFailure(fixtureRoot, ['scripts/sync-version.mjs', '--source-only', '3.0.0']);
  assert.match(result.stderr, /Could not find BACKEND_WASM_PACKAGE_VERSION/u);
  assert.deepEqual(snapshot(fixtureRoot), before);
});

await runTest('an injected write failure rolls back every attempted write', fixtureRoot => {
  const before = snapshot(fixtureRoot);
  const result = runFailure(fixtureRoot, ['scripts/sync-version.mjs', '--source-only', '3.0.1'], {
    NODE_ENV: 'test',
    TOKAMAK_ZK_EVM_SYNC_TEST_FAIL_AFTER_WRITES: '2',
  });
  assert.match(result.stderr, /All attempted writes were rolled back/u);
  assert.deepEqual(snapshot(fixtureRoot), before);
});

console.log('[sync-version-test] Atomic source and complete synchronization checks passed.');

/**
 * @param {string} name
 * @param {(fixtureRoot: string) => void} testBody
 */
async function runTest(name, testBody) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tokamak-version-sync-'));
  try {
    copyFixture(fixtureRoot);
    testBody(fixtureRoot);
    console.log(`[sync-version-test] ${name}`);
  } finally {
    fs.rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

/** @param {string} fixtureRoot */
function copyFixture(fixtureRoot) {
  for (const relativePath of fixtureFiles) {
    copyFile(fixtureRoot, relativePath);
  }
}

/** @param {string} fixtureRoot */
function copyTrackedBackendWorkspace(fixtureRoot) {
  const result = spawnSync('git', ['ls-files', '-z', 'packages/backend'], {
    cwd: repositoryRoot,
    encoding: 'buffer',
  });
  assert.equal(result.status, 0, result.stderr.toString('utf8'));
  for (const relativePath of result.stdout.toString('utf8').split('\0').filter(Boolean)) {
    copyFile(fixtureRoot, relativePath);
  }
}

/**
 * @param {string} fixtureRoot
 * @param {string} relativePath
 */
function copyFile(fixtureRoot, relativePath) {
  const sourcePath = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(sourcePath)) return;
  const destinationPath = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

/**
 * @param {string} fixtureRoot
 * @param {string[]} argumentsList
 * @param {NodeJS.ProcessEnv} [additionalEnvironment]
 */
function run(fixtureRoot, argumentsList, additionalEnvironment = {}) {
  execFileSync(process.execPath, argumentsList, {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: { ...process.env, ...additionalEnvironment },
    stdio: 'pipe',
  });
}

/**
 * @param {string} fixtureRoot
 * @param {string[]} argumentsList
 * @param {NodeJS.ProcessEnv} [additionalEnvironment]
 */
function runFailure(fixtureRoot, argumentsList, additionalEnvironment = {}) {
  const result = spawnSync(process.execPath, argumentsList, {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: { ...process.env, ...additionalEnvironment },
  });
  assert.notEqual(result.status, 0, `Expected failure from ${argumentsList.join(' ')}`);
  return result;
}

/** @param {string} fixtureRoot */
function snapshot(fixtureRoot) {
  return Object.fromEntries(
    [...fixtureFiles]
      .filter(relativePath => fs.existsSync(path.join(fixtureRoot, relativePath)))
      .sort()
      .map(relativePath => [relativePath, fs.readFileSync(path.join(fixtureRoot, relativePath), 'utf8')]),
  );
}

/**
 * @param {string} fixtureRoot
 * @param {string} relativePath
 */
function readJson(fixtureRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), 'utf8'));
}

/**
 * @param {string} fixtureRoot
 * @param {string} packageName
 */
function readCargoPackageVersion(fixtureRoot, packageName) {
  const lockfile = fs.readFileSync(path.join(fixtureRoot, BACKEND_CARGO_LOCK), 'utf8');
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const block = new RegExp(
    `\\[\\[package\\]\\]\\n(?:(?!\\n\\[\\[package\\]\\])[\\s\\S])*?^name = "${escapedName}"$(?:(?!\\n\\[\\[package\\]\\])[\\s\\S])*?^version = "([^"]+)"$`,
    'mu',
  ).exec(lockfile);
  assert.ok(block, `Expected ${packageName} in ${BACKEND_CARGO_LOCK}`);
  return block[1];
}
