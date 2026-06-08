#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

function absolutePath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function fileExists(relativePath) {
  return fs.existsSync(absolutePath(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(absolutePath(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function requireFile(relativePath) {
  if (!fileExists(relativePath)) {
    fail(`${relativePath} is missing.`);
    return false;
  }
  return true;
}

function requireIncludes(relativePath, needle, description = needle) {
  if (!requireFile(relativePath)) {
    return;
  }
  const text = readText(relativePath);
  if (!text.includes(needle)) {
    fail(`${relativePath} must include ${description}.`);
  }
}

function requirePattern(relativePath, pattern, description) {
  if (!requireFile(relativePath)) {
    return;
  }
  const text = readText(relativePath);
  if (!pattern.test(text)) {
    fail(`${relativePath} must include ${description}.`);
  }
}

function parseMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)].map(match => match[1]);
}

function stripAnchor(linkTarget) {
  return linkTarget.split('#')[0];
}

function isExternalLink(linkTarget) {
  return /^[a-z][a-z0-9+.-]*:/iu.test(linkTarget);
}

function checkLlmsTxt() {
  const relativePath = 'llms.txt';
  if (!requireFile(relativePath)) {
    return;
  }

  const text = readText(relativePath);
  for (const packageName of [
    '@tokamak-zk-evm/cli',
    '@tokamak-zk-evm/subcircuit-library',
    '@tokamak-zk-evm/synthesizer-node',
    '@tokamak-zk-evm/synthesizer-web',
  ]) {
    if (!text.includes(packageName)) {
      fail(`${relativePath} must include ${packageName}.`);
    }
  }

  for (const linkTarget of parseMarkdownLinks(text)) {
    if (isExternalLink(linkTarget)) {
      continue;
    }
    const localTarget = stripAnchor(linkTarget);
    if (!localTarget) {
      continue;
    }
    if (!fileExists(localTarget)) {
      fail(`${relativePath} links to missing local target ${linkTarget}.`);
    }
  }

  if (/@tokamak-zk-evm\/verify-wasm|verify-wasm/iu.test(text)) {
    fail(`${relativePath} must not list deprecated WASM verifier packages as supported public packages.`);
  }
}

function checkRootReadme() {
  const relativePath = 'README.md';

  for (const required of [
    '## Package Chooser',
    '@tokamak-zk-evm/cli',
    '@tokamak-zk-evm/subcircuit-library',
    '@tokamak-zk-evm/synthesizer-node',
    '@tokamak-zk-evm/synthesizer-web',
    '## Repository FAQ',
    '### What is Tokamak zk-EVM?',
    '### What is a Tokamak Layer 2 transaction?',
    'tokamak-l2js',
    'https://github.com/tokamak-network/TokamakL2JS',
    '### What are the main package groups in this monorepo?',
    'The CLI package is the end-to-end user entry point.',
    'The Synthesizer packages convert Tokamak L2 transaction replay data into circuit-ready inputs.',
    'The subcircuit library package publishes the prebuilt R1CS',
    'The backend packages implement setup, proof generation, and proof verification',
    'An Efficient SNARK for Field-Programmable and RAM Circuits',
    'https://eprint.iacr.org/2024/507',
    'bridge/src/verifiers/TokamakVerifier.sol',
    'https://etherscan.io/address/0x0C467a5082323Cc6F4b7077A9dFb0bbdaf6eC626',
    'The WASM verifier packages are deprecated.',
    'CHANGELOG.md',
  ]) {
    requireIncludes(relativePath, required);
  }

  requirePattern(
    relativePath,
    /Are the WASM verifier packages officially supported\?[\s\S]*?historical or reference material\./u,
    'the deprecated WASM verifier FAQ answer',
  );

  if (/@tokamak-zk-evm\/verify-wasm|verify-wasm-web|verify-wasm-nodejs|verify-wasm-bundler/u.test(readText(relativePath))) {
    fail(`${relativePath} must not list deprecated WASM verifier packages as supported package choices.`);
  }
}

function checkPackageReadmes() {
  const packageReadmes = [
    ['packages/cli/README.md', '@tokamak-zk-evm/cli'],
    ['packages/frontend/qap-compiler/README.md', '@tokamak-zk-evm/subcircuit-library'],
    ['packages/frontend/synthesizer/node-cli/README.md', '@tokamak-zk-evm/synthesizer-node'],
    ['packages/frontend/synthesizer/web-app/README.md', '@tokamak-zk-evm/synthesizer-web'],
  ];

  for (const [relativePath, packageName] of packageReadmes) {
    requireIncludes(relativePath, '## When to use this package');
    requireIncludes(relativePath, packageName);
    requireIncludes(relativePath, 'CHANGELOG.md', 'a root changelog link');
  }
}

function checkPackageMetadata() {
  const manifests = [
    'packages/cli/package.json',
    'packages/frontend/qap-compiler/package.json',
    'packages/frontend/synthesizer/node-cli/package.json',
    'packages/frontend/synthesizer/web-app/package.json',
  ];

  for (const relativePath of manifests) {
    if (!requireFile(relativePath)) {
      continue;
    }
    const manifest = readJson(relativePath);
    for (const field of ['description', 'keywords', 'homepage', 'repository', 'bugs', 'license', 'author']) {
      if (manifest[field] === undefined || manifest[field] === '') {
        fail(`${relativePath} must define ${field}.`);
      }
    }
    if (!Array.isArray(manifest.keywords) || manifest.keywords.length === 0) {
      fail(`${relativePath} must define non-empty keywords.`);
    }
    if (!manifest.repository?.url || !manifest.repository?.directory) {
      fail(`${relativePath} must define repository.url and repository.directory.`);
    }
    if (!manifest.bugs?.url) {
      fail(`${relativePath} must define bugs.url.`);
    }
  }
}

function checkSynthesizerFaq() {
  const relativePath = 'packages/frontend/synthesizer/README.md';
  for (const required of [
    '<a id="transaction-support-faq"></a>',
    'Does the current implementation support any arbitrary transaction/call data',
    'Partially, yes.',
    'support depends on whether the execution stays within the opcode set',
    'it should not yet be described as supporting every arbitrary Ethereum transaction',
  ]) {
    requireIncludes(relativePath, required);
  }
}

function checkWasmVerifierDeprecation() {
  const markdownFiles = [
    'packages/backend/verify/verify-wasm/README.md',
    'packages/backend/verify/verify-wasm/QUICK_START.md',
    'packages/backend/verify/verify-wasm/NPM_USAGE.md',
  ];
  const notice = 'Deprecated: The WASM verifier packages are no longer officially supported.';
  const replacement = 'For local verification, use `@tokamak-zk-evm/cli` and the supported backend verification flow.';

  for (const relativePath of markdownFiles) {
    requireIncludes(relativePath, notice);
    requireIncludes(relativePath, replacement);
    requirePattern(relativePath, /historical|reference/iu, 'historical or reference wording');
  }

  const manifest = readJson('packages/backend/verify/verify-wasm/package.json');
  if (!String(manifest.description ?? '').startsWith('Deprecated')) {
    fail('packages/backend/verify/verify-wasm/package.json description must start with Deprecated.');
  }
  for (const keyword of ['deprecated', 'historical']) {
    if (!manifest.keywords?.includes(keyword)) {
      fail(`packages/backend/verify/verify-wasm/package.json must include ${keyword} keyword.`);
    }
  }
}

checkLlmsTxt();
checkRootReadme();
checkPackageReadmes();
checkPackageMetadata();
checkSynthesizerFaq();
checkWasmVerifierDeprecation();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[doc-readiness] ${failure}`);
  }
  process.exit(1);
}

console.log('[doc-readiness] Documentation exposure checks passed.');
