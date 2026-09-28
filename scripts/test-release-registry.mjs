#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectTarball, interpretNpmViewResult } from './release-registry.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tokamak-release-registry-'));
try {
  testRegistryResponses();
  testTarballIdentity();
  console.log('[release-registry] Exact npm package identity checks passed.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

function testRegistryResponses() {
  assert.deepEqual(
    interpretNpmViewResult('@tokamak-zk-evm/example@1.2.3', { status: 1, stderr: 'npm error code E404' }),
    { state: 'absent' },
  );
  assert.throws(
    () => interpretNpmViewResult('@tokamak-zk-evm/example@1.2.3', { status: 1, stderr: 'npm error code E401' }),
    /registry lookup failed/u,
  );
  assert.throws(
    () => interpretNpmViewResult('@tokamak-zk-evm/example@1.2.3', { status: 0, stdout: '{' }),
    /malformed metadata/u,
  );

  const metadata = canonicalMetadata();
  assert.deepEqual(
    interpretNpmViewResult('@tokamak-zk-evm/example@1.2.3', { status: 0, stdout: JSON.stringify(metadata) }),
    { state: 'exact', metadata },
  );
  assert.throws(
    () =>
      interpretNpmViewResult('@tokamak-zk-evm/example@1.2.3', {
        status: 0,
        stdout: JSON.stringify({ ...metadata, integrity: 'sha512-not-a-canonical-digest' }),
      }),
    /canonical SHA-512 integrity/u,
  );
}

function testTarballIdentity() {
  const packageDirectory = path.join(directory, 'package');
  fs.mkdirSync(packageDirectory);
  fs.writeFileSync(
    path.join(packageDirectory, 'package.json'),
    JSON.stringify({ name: '@tokamak-zk-evm/example', version: '1.2.3' }),
  );
  const tarball = path.join(directory, 'example-1.2.3.tgz');
  execFileSync('tar', ['-czf', tarball, '-C', directory, 'package']);

  const integrity = `sha512-${createHash('sha512').update(fs.readFileSync(tarball)).digest('base64')}`;
  const exactMetadata = { ...canonicalMetadata(), integrity };
  assert.equal(inspectTarball(tarball, '@tokamak-zk-evm/example', '1.2.3', exactMetadata).state, 'exact');
  assert.equal(inspectTarball(tarball, '@tokamak-zk-evm/example', '2.0.0', exactMetadata).state, 'mismatch');
  assert.equal(
    inspectTarball(tarball, '@tokamak-zk-evm/example', '1.2.3', { ...exactMetadata, integrity: canonicalMetadata().integrity }).state,
    'mismatch',
  );
}

function canonicalMetadata() {
  return {
    integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}`,
    tarball: 'https://registry.npmjs.org/@tokamak-zk-evm/example/-/example-1.2.3.tgz',
  };
}
