const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { parseBackendVerificationResult } = require('../dist/runtime/verification-result.js');

test('accepts the versioned backend verification result', () => {
  assert.deepEqual(parseBackendVerificationResult('{"contractVersion":1,"verified":true}'), {
    contractVersion: 1,
    verified: true,
  });
});

test('rejects stdout diagnostics and malformed verification results', () => {
  for (const value of [
    'Verifier initialization...\n{"contractVersion":1,"verified":true}',
    '{"contractVersion":2,"verified":true}',
    '{"contractVersion":1,"verified":"true"}',
    '{"contractVersion":1,"verified":true,"detail":"unexpected"}',
  ]) {
    assert.throws(() => parseBackendVerificationResult(value));
  }
});

test('machine-result CLI commands suppress only stdout', () => {
  const cliSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.ts'), 'utf8');
  assert.match(
    cliSource,
    /args: stagePaths => \[\.\.\.backendVerifyArgs\(stagePaths\), '--verification-result-json'\],[\s\S]*?suppressStdout: true,/u,
  );
  assert.match(cliSource, /\['--build-identity-json'\],[\s\S]*?suppressStdout: true,/u);
});
