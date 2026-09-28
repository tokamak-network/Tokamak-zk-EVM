import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { findPackageTarball } from '../release-registry.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tarballDirectory = process.argv[2] && path.resolve(process.argv[2]);
if (!tarballDirectory) throw new Error('Usage: node scripts/release-e2e/native.mjs <tarball-directory>');

const version = JSON.parse(readFileSync(path.join(repository, 'package.json'), 'utf8')).version;
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'tokamak-native-e2e-'));
const cliName = '@tokamak-zk-evm/cli';
const synthesizerName = '@tokamak-zk-evm/synthesizer-node';

try {
  const cliTarball = findPackageTarball(tarballDirectory, cliName);
  const synthesizerTarball = findPackageTarball(tarballDirectory, synthesizerName);
  writeFileSync(path.join(temporaryRoot, 'package.json'), `${JSON.stringify({
    private: true,
    name: 'tokamak-release-native-e2e',
    dependencies: {
      [cliName]: `file:${cliTarball}`,
      [synthesizerName]: `file:${synthesizerTarball}`,
      '@tokamak-zk-evm/subcircuit-library': version,
    },
  })}\n`);
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], temporaryRoot);

  const cliRoot = path.join(temporaryRoot, 'node_modules', '@tokamak-zk-evm', 'cli');
  const synthesizerRoot = path.join(temporaryRoot, 'node_modules', '@tokamak-zk-evm', 'synthesizer-node');
  assert.equal(JSON.parse(readFileSync(path.join(cliRoot, 'package.json'), 'utf8')).version, version);
  assert.equal(JSON.parse(readFileSync(path.join(synthesizerRoot, 'package.json'), 'utf8')).version, version);
  const resolvedSynthesizer = createRequire(path.join(cliRoot, 'package.json')).resolve(synthesizerName);
  assert.ok(realpathSync(resolvedSynthesizer).startsWith(`${realpathSync(synthesizerRoot)}${path.sep}`));

  const cli = path.join(cliRoot, 'dist', 'cli.js');
  const environment = {
    ...process.env,
    TOKAMAK_ZKEVM_CLI_CACHE_DIR: path.join(temporaryRoot, 'cache'),
    CARGO_TARGET_DIR: path.join(temporaryRoot, 'cargo-target'),
  };
  const fixture = path.join(repository, 'packages/frontend/synthesizer/examples/privateState/transferNotes/transferNotes1To2');
  for (const args of [
    ['--install'],
    ['--synthesize', fixture],
    ['--preprocess'],
    ['--prove'],
    ['--verify'],
  ]) {
    run(process.execPath, [cli, ...args], temporaryRoot, environment);
  }
  console.log('Native candidate-package synthesis, preprocess, prove, and verify passed.');
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status ?? 'unknown'}.`);
  }
}
