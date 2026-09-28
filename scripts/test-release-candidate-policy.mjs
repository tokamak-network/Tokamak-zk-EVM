#!/usr/bin/env node

import assert from 'node:assert/strict';
import { validateReleaseCandidate } from './release-candidate-policy.mjs';

assert.deepEqual(
  validateReleaseCandidate({ currentVersion: '2.1.5', baseVersion: '2.1.5', changelog: '## Unreleased\n' }),
  { changed: false, version: '2.1.5' },
);
assert.deepEqual(
  validateReleaseCandidate({
    currentVersion: '3.0.0',
    baseVersion: '2.1.5',
    changelog: '# Changelog\n\n## [3.0.0] - 2026-08-31\n',
  }),
  { changed: true, version: '3.0.0', date: '2026-08-31' },
);
assert.throws(
  () =>
    validateReleaseCandidate({
      currentVersion: '3.0.0',
      baseVersion: '2.1.5',
      changelog: '## Unreleased\n\n## [3.0.0] - 2026-08-31\n',
    }),
  /must not retain an Unreleased/u,
);
assert.throws(
  () =>
    validateReleaseCandidate({
      currentVersion: '3.0.0',
      baseVersion: '2.1.5',
      changelog: '## [3.0.0] - 2026-02-30\n',
    }),
  /valid calendar date/u,
);
console.log('[release-candidate-policy-test] Offline preparation-date boundary passed.');
