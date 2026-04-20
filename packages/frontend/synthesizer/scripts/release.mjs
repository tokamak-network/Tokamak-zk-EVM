#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, '..');
const workspaceTagPrefix = 'synthesizer-v';
const packageEntries = [
  {
    changelogHeading: 'node-cli',
    dir: 'node-cli',
    name: '@tokamak-zk-evm/synthesizer-node',
  },
  {
    changelogHeading: 'web-app',
    dir: 'web-app',
    name: '@tokamak-zk-evm/synthesizer-web',
  },
];
const officialDocs = [
  'README.md',
  'llms.txt',
  'CHANGELOG.md',
  'docs/README.md',
  'docs/architecture.md',
  'docs/maintainer-guide.md',
  'node-cli/README.md',
  'web-app/README.md',
];
const secondaryDocs = [
  'docs/class-structure.md',
  'docs/code-examples.md',
  'docs/data-structure.md',
  'docs/dual-target-packaging.md',
  'docs/execution-flow.md',
  'docs/introduction.md',
  'docs/opcodes.md',
  'docs/output-files.md',
  'docs/repository-structure.md',
  'docs/terminology.md',
  'docs/transaction-flow.md',
];
const expectedSecondaryNote = '> Internal reference note:';

if (process.argv.includes('--help')) {
  console.log(`Tokamak zk-EVM Synthesizer workspace release tool

Usage:
  npm run release

Behavior:
  - validates synchronized package versions and canonical docs
  - compares local package versions with npm
  - fails if nothing needs to be published
  - builds the workspace
  - publishes node-cli first, then web-app, when needed
  - creates a '${workspaceTagPrefix}X.Y.Z' Git tag after successful publish`);
  process.exit(0);
}

function fail(message) {
  console.error(`[release] ${message}`);
  process.exit(1);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? workspaceRoot,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const details = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(
      `Command failed: ${command} ${args.join(' ')}${details ? `\n${details}` : ''}`,
    );
  }

  return result;
}

function readJson(relativePath) {
  const filePath = path.join(workspaceRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

function ensureFile(relativePath) {
  const filePath = path.join(workspaceRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`Required file not found: ${relativePath}`);
  }
}

function parseSemver(version, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    fail(`Expected ${label} to be a strict semver string, got '${version}'.`);
  }

  return match.slice(1).map(part => Number(part));
}

function compareSemver(left, right) {
  const a = parseSemver(left, 'local version');
  const b = parseSemver(right, 'remote version');

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] > b[index]) {
      return 1;
    }
    if (a[index] < b[index]) {
      return -1;
    }
  }

  return 0;
}

function findBrokenMarkdownLinks(relativePath) {
  const source = readText(relativePath);
  const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  const broken = [];
  let match = markdownLinkPattern.exec(source);

  while (match) {
    const target = match[1];
    if (
      !target.startsWith('http://') &&
      !target.startsWith('https://') &&
      !target.startsWith('mailto:') &&
      !target.startsWith('#')
    ) {
      const normalizedTarget = target.split('#')[0];
      const resolved = path.resolve(path.dirname(path.join(workspaceRoot, relativePath)), normalizedTarget);
      if (!fs.existsSync(resolved)) {
        broken.push(`${relativePath} -> ${target}`);
      }
    }
    match = markdownLinkPattern.exec(source);
  }

  return broken;
}

function validateDocs(version) {
  for (const file of [...officialDocs, ...secondaryDocs]) {
    ensureFile(file);
  }

  const llms = readText('llms.txt');
  const requiredLlmsPaths = [
    'README.md',
    'node-cli/README.md',
    'web-app/README.md',
    'docs/README.md',
    'docs/maintainer-guide.md',
    'docs/architecture.md',
  ];

  for (const relativePath of requiredLlmsPaths) {
    if (!llms.includes(relativePath)) {
      fail(`llms.txt must include the canonical path '${relativePath}'.`);
    }
  }

  const brokenLinks = officialDocs
    .filter(file => file.endsWith('.md'))
    .flatMap(findBrokenMarkdownLinks);

  if (brokenLinks.length > 0) {
    fail(`Broken documentation links detected:\n${brokenLinks.join('\n')}`);
  }

  for (const file of secondaryDocs) {
    const contents = readText(file);
    if (!contents.startsWith(expectedSecondaryNote)) {
      fail(`Secondary reference documents must start with '${expectedSecondaryNote}' (${file}).`);
    }
  }

  const changelog = readText('CHANGELOG.md');
  if (!changelog.includes('## Unreleased')) {
    fail("CHANGELOG.md must include an 'Unreleased' section.");
  }

  const versionHeading = `## [${version}]`;
  if (!changelog.includes(versionHeading)) {
    fail(`CHANGELOG.md must include a '${versionHeading}' section.`);
  }

  for (const section of ['node-cli', 'web-app', 'core']) {
    const sectionHeading = `### ${section}`;
    if (!changelog.includes(sectionHeading)) {
      fail(`CHANGELOG.md must include a '${sectionHeading}' subsection for released versions.`);
    }
  }
}

function validatePackageMetadata(version) {
  for (const entry of packageEntries) {
    const manifest = readJson(`${entry.dir}/package.json`);
    if (manifest.version !== version) {
      fail(`Expected ${entry.dir}/package.json version to equal '${version}', got '${manifest.version}'.`);
    }

    const files = new Set(Array.isArray(manifest.files) ? manifest.files : []);
    for (const required of ['dist', 'CHANGELOG.md', 'README.md']) {
      if (!files.has(required)) {
        fail(`${entry.dir}/package.json must publish '${required}'.`);
      }
    }
  }
}

function validateWorkspaceState(version) {
  const status = runCommand('git', ['status', '--short']).stdout.trim();
  if (status.length > 0) {
    fail('Release requires a clean Git worktree.');
  }

  validatePackageMetadata(version);
  validateDocs(version);

  const tagName = `${workspaceTagPrefix}${version}`;
  const existingTag = runCommand('git', ['tag', '-l', tagName]).stdout.trim();
  if (existingTag === tagName) {
    fail(`Git tag '${tagName}' already exists.`);
  }
}

function queryRemoteVersion(packageName) {
  const result = runCommand('npm', ['view', packageName, 'version', '--json']);
  const trimmed = result.stdout.trim();
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed.at(-1) : parsed;
}

const nodeManifest = readJson('node-cli/package.json');
const webManifest = readJson('web-app/package.json');

if (nodeManifest.version !== webManifest.version) {
  fail(
    `Synchronized release policy violation: node-cli=${nodeManifest.version}, web-app=${webManifest.version}.`,
  );
}

const localVersion = nodeManifest.version;
validateWorkspaceState(localVersion);

const packagesToPublish = [];
for (const entry of packageEntries) {
  const remoteVersion = queryRemoteVersion(entry.name);
  const comparison = compareSemver(localVersion, remoteVersion);

  if (comparison === 0) {
    console.log(`[release] ${entry.name} is already published at ${remoteVersion}; skipping.`);
    continue;
  }

  if (comparison < 0) {
    fail(
      `Local version ${localVersion} is behind npm version ${remoteVersion} for ${entry.name}.`,
    );
  }

  packagesToPublish.push(entry);
}

if (packagesToPublish.length === 0) {
  fail(`No packages require publishing for ${localVersion}.`);
}

console.log(`[release] Building workspace for version ${localVersion}.`);
runCommand('npm', ['run', 'build'], { stdio: 'inherit' });

for (const entry of packagesToPublish) {
  console.log(`[release] Publishing ${entry.name} from ${entry.dir}.`);
  runCommand('npm', ['publish'], {
    cwd: path.join(workspaceRoot, entry.dir),
    stdio: 'inherit',
  });
}

const tagName = `${workspaceTagPrefix}${localVersion}`;
console.log(`[release] Creating Git tag ${tagName}.`);
runCommand('git', ['tag', tagName], { stdio: 'inherit' });

console.log(`[release] Release completed for version ${localVersion}.`);
