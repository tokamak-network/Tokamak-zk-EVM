#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertExactReleaseLineDependency,
  createPackageBuildMetadata,
} from '../packages/frontend/synthesizer/scripts/build-metadata.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
validatePackageBuildMetadata(
  'packages/frontend/synthesizer/node-cli',
  '@tokamak-zk-evm/synthesizer-node',
  'runtime-installed',
);

assert.throws(
  () => assertExactReleaseLineDependency('3.0', '3.0.0', '3.0.0', 'invalid-package-version'),
  /Invalid synchronized subcircuit-library version/u,
);
assert.throws(
  () => assertExactReleaseLineDependency('3.0.0', '2.1.5', '2.1.5', 'mismatched-declaration'),
  /must declare .*@3\.0\.0 exactly/u,
);
assert.throws(
  () => assertExactReleaseLineDependency('3.0.0', '3.0.0', '2.1.5', 'mismatched-resolution'),
  /resolved .*@2\.1\.5, expected the declared exact version 3\.0\.0/u,
);
validatePackageBuildMetadata('packages/frontend/synthesizer/web-app', '@tokamak-zk-evm/synthesizer-web', 'bundled');

/**
 * @param {string} directory
 * @param {string} expectedPackageName
 * @param {'bundled' | 'runtime-installed'} subcircuitLibraryMode
 */
function validatePackageBuildMetadata(directory, expectedPackageName, subcircuitLibraryMode) {
  const metadata = createPackageBuildMetadata(path.join(repositoryRoot, directory), {
    subcircuitLibrary: subcircuitLibraryMode,
    tokamakL2js: 'bundled',
  });
  assert.equal(metadata.packageName, expectedPackageName);
  assert.equal(metadata.dependencies.subcircuitLibrary.declaredRange, metadata.packageVersion);
  assert.equal(metadata.dependencies.subcircuitLibrary.buildVersion, metadata.packageVersion);
  assert.equal(metadata.dependencies.tokamakL2js.declaredRange, '0.2.0');
  assert.equal(metadata.dependencies.tokamakL2js.buildVersion, '0.2.0');
}

console.log('[synthesizer-build-tools] Build metadata imports and synchronized dependencies are valid.');
