#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleaseCandidate } from './release-candidate-policy.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseRef = parseBaseRef(process.argv.slice(2));
const currentVersion = readJson(path.join(repositoryRoot, 'package.json')).version;
const baseVersion = JSON.parse(
  execFileSync('git', ['show', `${baseRef}:package.json`], { cwd: repositoryRoot, encoding: 'utf8' }),
).version;

const result = validateReleaseCandidate({
  currentVersion,
  baseVersion,
  changelog: fs.readFileSync(path.join(repositoryRoot, 'CHANGELOG.md'), 'utf8'),
});
if (!result.changed) {
  console.log(`[release-candidate] Version is unchanged at ${currentVersion}; no dated release entry is required.`);
  process.exit(0);
}
console.log(`[release-candidate] Validated offline preparation date ${result.date} for ${currentVersion}.`);

function parseBaseRef(argumentsList) {
  const argument = argumentsList.find(value => value.startsWith('--base-ref='));
  if (!argument || argumentsList.length !== 1) throw new Error('Exactly one --base-ref=<commit> option is required.');
  const value = argument.slice('--base-ref='.length);
  if (!/^[0-9a-f]{40}$/u.test(value)) throw new Error('The base ref must be a full commit SHA.');
  return value;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
