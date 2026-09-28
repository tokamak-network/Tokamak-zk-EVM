const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { normalizeCompatibleBackendVersion, packageCompatibleVersion } = require('../dist/runtime/context.js');

const contract = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'versioning', 'compatibility-contract.json'), 'utf8'),
);

test('CLI version parsing conforms to the repository contract', () => {
  for (const testCase of contract.compatibleBackendVersions) {
    if (testCase.canonical === undefined) {
      assert.throws(
        () => normalizeCompatibleBackendVersion(testCase.input, 'test compatibility version'),
        undefined,
        `compatibility input ${JSON.stringify(testCase.input)} must be rejected`,
      );
    } else {
      assert.equal(normalizeCompatibleBackendVersion(testCase.input, 'test compatibility version'), testCase.canonical);
    }
  }

  for (const testCase of contract.packageVersions) {
    if (testCase.compatibility === undefined) {
      assert.throws(
        () => packageCompatibleVersion(testCase.input, 'test package version'),
        undefined,
        `package input ${JSON.stringify(testCase.input)} must be rejected`,
      );
    } else {
      assert.equal(packageCompatibleVersion(testCase.input, 'test package version'), testCase.compatibility);
    }
  }
});
