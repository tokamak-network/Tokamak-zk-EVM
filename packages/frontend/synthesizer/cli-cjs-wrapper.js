#!/usr/bin/env node

// CommonJS wrapper for pkg compatibility
const { spawn } = require('child_process');
const path = require('path');

// Use tsx to run the TypeScript CLI directly
const cliPath = path.join(__dirname, 'src', 'cli', 'index.ts');

const child = spawn('npx', ['tsx', cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: __dirname,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Error executing synthesizer:', error);
  process.exit(1);
});
