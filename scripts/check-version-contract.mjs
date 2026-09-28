#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCompatibleBackendVersion, parsePackageVersion } from './version-contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = path.join(repoRoot, 'versioning', 'compatibility-contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

let failures = 0;

for (const testCase of contract.compatibleBackendVersions) {
  checkCase(
    `compatibleBackendVersions ${JSON.stringify(testCase.input)}`,
    () => parseCompatibleBackendVersion(testCase.input),
    testCase.canonical,
  );
}

for (const testCase of contract.packageVersions) {
  checkCase(
    `packageVersions ${JSON.stringify(testCase.input)}`,
    () => parsePackageVersion(testCase.input).compatibility,
    testCase.compatibility,
  );
}

if (failures > 0) {
  process.exit(1);
}

console.log('[version-contract] JavaScript implementation conforms to the repository contract.');

function checkCase(label, parse, expected) {
  try {
    const actual = parse();
    if (expected === undefined) {
      console.error(`[version-contract] ${label} must be rejected, got ${actual}.`);
      failures += 1;
    } else if (actual !== expected) {
      console.error(`[version-contract] ${label} expected ${expected}, got ${actual}.`);
      failures += 1;
    }
  } catch (error) {
    if (expected !== undefined) {
      console.error(`[version-contract] ${label} must be accepted: ${error.message}`);
      failures += 1;
    }
  }
}
