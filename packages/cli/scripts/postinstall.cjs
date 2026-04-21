#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const packageRoot = path.resolve(__dirname, '..');
const repoRootCandidate = path.resolve(packageRoot, '..', '..');

function isRepositoryWorkspaceInstall() {
  return (
    fs.existsSync(path.join(repoRootCandidate, '.git')) &&
    path.resolve(repoRootCandidate, 'packages', 'cli') === packageRoot
  );
}

if (process.env.TOKAMAK_ZKEVM_SKIP_POSTINSTALL === '1') {
  process.exit(0);
}

if (isRepositoryWorkspaceInstall()) {
  console.error('[tokamak-cli] Skipping postinstall inside the repository workspace.');
  process.exit(0);
}

const cliEntry = path.join(packageRoot, 'dist', 'cli.js');
if (!fs.existsSync(cliEntry)) {
  console.error('[tokamak-cli] Skipping postinstall because dist/cli.js is missing.');
  process.exit(0);
}

const result = spawnSync(process.execPath, [cliEntry, '--install'], {
  cwd: packageRoot,
  env: process.env,
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
