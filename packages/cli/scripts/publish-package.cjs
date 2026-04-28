#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (typeof result.status === 'number') {
    process.exitCode = result.status;
    if (result.status !== 0) {
      process.exit(result.status);
    }
    return;
  }

  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const npm = npmCommand();

run(npm, ['run', 'sync:changelog']);
run(npm, ['run', 'release:check']);
run(npm, ['run', 'build']);
run(npm, ['publish', '--access', 'public', '--ignore-scripts', ...extraArgs]);
