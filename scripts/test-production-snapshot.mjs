#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkerPath = path.join(repositoryRoot, 'scripts', 'check-production-snapshot.mjs');
const expectedVersion = '3.0.0';
const packageName = '@tokamak-zk-evm/subcircuit-library';

await withFixture('accepts a genuine synchronized production snapshot', fixture => {
  assert.equal(runChecker(fixture).status, 0);
});

for (const testCase of [
  {
    name: 'stale resolved version',
    mutate: fixture => {
      fixture.lockfile.packages[`node_modules/${packageName}`].version = '2.1.5';
    },
    expected: /resolves .*2\.1\.5.*expected 3\.0\.0/u,
  },
  {
    name: 'forged version with old integrity',
    mutate: fixture => {
      fixture.lockfile.packages[`node_modules/${packageName}`].integrity =
        `sha512-${crypto.createHash('sha512').update('old-published-package').digest('base64')}`;
    },
    expected: /integrity does not match the npm registry metadata/u,
  },
  {
    name: 'non-npm origin',
    mutate: fixture => {
      fixture.generated = fixture.generated.replace('"npmSnapshot"', '"localQapCompiler"');
    },
    expected: /SUBCIRCUIT_LIBRARY_ORIGIN.*expected "npmSnapshot"/u,
  },
  {
    name: 'mismatched installed package',
    mutate: fixture => {
      fixture.manifest.version = '2.1.5';
    },
    expected: /Installed package identity.*2\.1\.5.*expected.*3\.0\.0/u,
  },
  {
    name: 'mismatched build metadata',
    mutate: fixture => {
      fixture.buildMetadata.packageVersion = '2.1.5';
    },
    expected: /build metadata does not match/u,
  },
]) {
  await withFixture(`rejects ${testCase.name}`, fixture => {
    testCase.mutate(fixture);
    writeFixture(fixture);
    const result = runChecker(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, testCase.expected);
  });
}

console.log('[production-snapshot-test] Production snapshot identity checks passed.');

/**
 * @param {string} name
 * @param {(fixture: ReturnType<typeof createFixture>) => void} body
 */
async function withFixture(name, body) {
  const fixture = createFixture();
  try {
    writeFixture(fixture);
    body(fixture);
    console.log(`[production-snapshot-test] ${name}`);
  } finally {
    fs.rmSync(fixture.root, { force: true, recursive: true });
  }
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokamak-production-snapshot-'));
  const packageRoot = path.join(root, 'package');
  const lockfilePath = path.join(root, 'package-lock.json');
  const generatedPath = path.join(root, 'setup.generated.ts');
  const registryMetadataPath = path.join(root, 'registry-metadata.json');
  const integrity = `sha512-${crypto.createHash('sha512').update('fixture').digest('base64')}`;
  const tarball = `https://registry.npmjs.org/@tokamak-zk-evm/subcircuit-library/-/subcircuit-library-${expectedVersion}.tgz`;
  return {
    root,
    packageRoot,
    lockfilePath,
    generatedPath,
    registryMetadataPath,
    manifest: { name: packageName, version: expectedVersion },
    buildMetadata: { packageName, packageVersion: expectedVersion },
    lockfile: {
      packages: {
        '': { dependencies: { [packageName]: expectedVersion } },
        [`node_modules/${packageName}`]: {
          version: expectedVersion,
          resolved: tarball,
          integrity,
        },
      },
    },
    generated: [
      `export const NATIVE_BACKEND_VERSION = "${expectedVersion}";`,
      'export const SUBCIRCUIT_LIBRARY_ORIGIN = "npmSnapshot";',
      `export const SUBCIRCUIT_LIBRARY_PACKAGE_VERSION = "${expectedVersion}";`,
      '',
    ].join('\n'),
    registryMetadata: { integrity, tarball },
  };
}

/** @param {ReturnType<typeof createFixture>} fixture */
function writeFixture(fixture) {
  fs.mkdirSync(path.join(fixture.packageRoot, 'subcircuits', 'library'), { recursive: true });
  fs.writeFileSync(path.join(fixture.packageRoot, 'package.json'), `${JSON.stringify(fixture.manifest)}\n`);
  fs.writeFileSync(path.join(fixture.packageRoot, 'build-metadata.json'), `${JSON.stringify(fixture.buildMetadata)}\n`);
  fs.writeFileSync(path.join(fixture.packageRoot, 'subcircuits/library/setupParams.json'), '{}\n');
  fs.writeFileSync(path.join(fixture.packageRoot, 'subcircuits/library/subcircuitInfo.json'), '[]\n');
  fs.writeFileSync(fixture.lockfilePath, `${JSON.stringify(fixture.lockfile)}\n`);
  fs.writeFileSync(fixture.generatedPath, fixture.generated);
  fs.writeFileSync(fixture.registryMetadataPath, `${JSON.stringify(fixture.registryMetadata)}\n`);
}

/** @param {ReturnType<typeof createFixture>} fixture */
function runChecker(fixture) {
  return spawnSync(
    process.execPath,
    [
      checkerPath,
      `--expected-version=${expectedVersion}`,
      `--package-root=${fixture.packageRoot}`,
      `--lockfile=${fixture.lockfilePath}`,
      `--generated=${fixture.generatedPath}`,
      `--registry-metadata=${fixture.registryMetadataPath}`,
    ],
    { encoding: 'utf8' },
  );
}
