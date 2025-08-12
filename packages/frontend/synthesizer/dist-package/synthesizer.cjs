#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

// Get the directory where this script is located
const scriptDir = __dirname;
const cliPath = path.join(scriptDir, 'dist', 'esm', 'cli', 'index.js');

// Execute the CLI with all provided arguments using ES modules support
const child = spawn('node', [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Error executing synthesizer:', error);
  process.exit(1);
});
