#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicPackages = [
  'packages/cli/package.json',
  'packages/frontend/qap-compiler/package.json',
  'packages/frontend/synthesizer/node-cli/package.json',
  'packages/frontend/synthesizer/web-app/package.json',
  'packages/backend/wasm/package.json',
];
const failures = [];

for (const document of consumerDocuments()) checkLocalLinks(document);
for (const manifestPath of publicPackages) checkPackageDocumentation(manifestPath);

if (failures.length > 0) {
  for (const failure of failures) console.error(`[doc-readiness] ${failure}`);
  process.exit(1);
}

console.log('[doc-readiness] Consumer documentation links and package references are valid.');

function consumerDocuments() {
  return [
    'README.md',
    ...publicPackages.map(manifestPath => path.join(path.dirname(manifestPath), 'README.md')),
    'packages/backend/wasm/examples/browser/README.md',
  ];
}

function checkLocalLinks(documentPath) {
  const source = readText(documentPath).replace(/^```[\s\S]*?^```$/gmu, '');
  for (const target of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const link = target[1];
    if (/^[a-z][a-z0-9+.-]*:/iu.test(link)) continue;
    const relativeTarget = decodeURIComponent(link.split('#')[0]);
    if (!relativeTarget) continue;
    const resolved = path.normalize(path.join(path.dirname(documentPath), relativeTarget));
    if (!fs.existsSync(path.join(repositoryRoot, resolved))) {
      failures.push(`${documentPath} links to missing local target ${link}.`);
    }
  }
}

function checkPackageDocumentation(manifestPath) {
  const manifest = readJson(manifestPath);
  const packageRoot = path.dirname(manifestPath);
  const readmePath = path.join(packageRoot, 'README.md');
  if (!fs.existsSync(path.join(repositoryRoot, readmePath))) {
    failures.push(`${manifestPath} has no package README.`);
    return;
  }

  if (!readText(readmePath).includes(manifest.name)) {
    failures.push(`${readmePath} does not identify ${manifest.name}.`);
  }
  for (const field of ['homepage', 'repository', 'bugs']) {
    const value = field === 'repository' ? manifest.repository?.url : field === 'bugs' ? manifest.bugs?.url : manifest[field];
    if (typeof value !== 'string' || !/^(?:git\+)?https:\/\//u.test(value)) {
      failures.push(`${manifestPath} must provide an HTTPS ${field} reference for consumers.`);
    }
  }
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    failures.push(`${relativePath} is missing or invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}
