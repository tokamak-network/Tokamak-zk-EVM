#!/usr/bin/env node

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePackageVersion } from './version-contract.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendWasmRoot = path.join(repositoryRoot, 'packages', 'backend', 'wasm');
const options = parseOptions(process.argv.slice(2));
const expectedVersion = options.expectedVersion ?? readJson(path.join(repositoryRoot, 'package.json')).version;

try {
  parsePackageVersion(expectedVersion);
  const lockfilePath = options.lockfile ?? path.join(backendWasmRoot, 'package-lock.json');
  const generatedPath =
    options.generated ?? path.join(backendWasmRoot, 'src', 'generated', 'active', 'setup.generated.ts');
  const packageRoot = options.packageRoot ?? resolveInstalledPackageRoot(backendWasmRoot);
  const registryMetadata =
    options.registryMetadata === undefined
      ? readPublishedPackageMetadata(expectedVersion)
      : readJson(options.registryMetadata);
  validateProductionSnapshot({ expectedVersion, generatedPath, lockfilePath, packageRoot, registryMetadata });
  console.log(`[production-snapshot] Validated npm subcircuit-library snapshot ${expectedVersion}.`);
} catch (error) {
  console.error(`[production-snapshot] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

/** @param {string[]} argumentsList */
function parseOptions(argumentsList) {
  const supported = new Set(['expected-version', 'generated', 'lockfile', 'package-root', 'registry-metadata']);
  const result = {};
  for (const argument of argumentsList) {
    const match = /^--([^=]+)=(.+)$/u.exec(argument);
    if (match === null || !supported.has(match[1])) {
      throw new Error(`Unknown option ${argument}.`);
    }
    const propertyName = match[1].replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    result[propertyName] = match[1] === 'expected-version' ? match[2] : path.resolve(match[2]);
  }
  return result;
}

/** @param {string} packageConsumerRoot */
function resolveInstalledPackageRoot(packageConsumerRoot) {
  const requireFromConsumer = createRequire(path.join(packageConsumerRoot, 'package.json'));
  const packageJsonPath = requireFromConsumer.resolve('@tokamak-zk-evm/subcircuit-library/package.json');
  return path.dirname(packageJsonPath);
}

/**
 * @param {{ expectedVersion: string, generatedPath: string, lockfilePath: string, packageRoot: string, registryMetadata: { integrity?: unknown, tarball?: unknown } }} input
 */
function validateProductionSnapshot(input) {
  const packageName = '@tokamak-zk-evm/subcircuit-library';
  const manifest = readJson(path.join(input.packageRoot, 'package.json'));
  if (manifest.name !== packageName || manifest.version !== input.expectedVersion) {
    throw new Error(
      `Installed package identity is ${JSON.stringify(manifest.name)}@${JSON.stringify(manifest.version)}, expected ${packageName}@${input.expectedVersion}.`,
    );
  }

  const buildMetadata = readJson(path.join(input.packageRoot, 'build-metadata.json'));
  if (buildMetadata.packageName !== packageName || buildMetadata.packageVersion !== input.expectedVersion) {
    throw new Error('Installed package build metadata does not match the expected package identity.');
  }

  for (const requiredArtifact of ['subcircuits/library/setupParams.json', 'subcircuits/library/subcircuitInfo.json']) {
    if (!fs.existsSync(path.join(input.packageRoot, requiredArtifact))) {
      throw new Error(`Installed package is missing ${requiredArtifact}.`);
    }
  }

  const lockfile = readJson(input.lockfilePath);
  const rootDependency = lockfile.packages?.['']?.dependencies?.[packageName];
  if (rootDependency !== input.expectedVersion) {
    throw new Error(
      `Production lockfile declares ${packageName}@${JSON.stringify(rootDependency)}, expected ${input.expectedVersion}.`,
    );
  }
  const lockEntry = lockfile.packages?.[`node_modules/${packageName}`];
  if (lockEntry?.version !== input.expectedVersion) {
    throw new Error(
      `Production lockfile resolves ${packageName}@${JSON.stringify(lockEntry?.version)}, expected ${input.expectedVersion}.`,
    );
  }
  assertSha512Integrity(lockEntry.integrity);
  if (lockEntry.resolved !== input.registryMetadata.tarball) {
    throw new Error('Production lockfile tarball does not match the npm registry metadata.');
  }
  if (lockEntry.integrity !== input.registryMetadata.integrity) {
    throw new Error('Production lockfile integrity does not match the npm registry metadata.');
  }

  const generated = fs.readFileSync(input.generatedPath, 'utf8');
  assertGeneratedConstant(generated, 'NATIVE_BACKEND_VERSION', input.expectedVersion);
  assertGeneratedConstant(generated, 'SUBCIRCUIT_LIBRARY_PACKAGE_VERSION', input.expectedVersion);
  assertGeneratedConstant(generated, 'SUBCIRCUIT_LIBRARY_ORIGIN', 'npmSnapshot');
}

/** @param {string} version */
function readPublishedPackageMetadata(version) {
  const packageSpec = `@tokamak-zk-evm/subcircuit-library@${version}`;
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let output;
  try {
    output = execFileSync(
      npmCommand,
      ['view', packageSpec, 'dist', '--json', '--registry=https://registry.npmjs.org'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    const detail =
      error !== null && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr).trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Unable to read published npm metadata for ${packageSpec}: ${detail}`);
  }

  try {
    const metadata = JSON.parse(output);
    if (metadata === null || typeof metadata !== 'object') {
      throw new Error('response is not an object');
    }
    return metadata;
  } catch (error) {
    throw new Error(
      `npm returned invalid distribution metadata for ${packageSpec}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** @param {unknown} integrity */
function assertSha512Integrity(integrity) {
  if (typeof integrity !== 'string' || !integrity.startsWith('sha512-')) {
    throw new Error('Production lockfile integrity must use sha512.');
  }
  const digest = Buffer.from(integrity.slice('sha512-'.length), 'base64');
  if (digest.length !== 64 || `sha512-${digest.toString('base64')}` !== integrity) {
    throw new Error('Production lockfile integrity is not a canonical sha512 digest.');
  }
}

/**
 * @param {string} source
 * @param {string} constantName
 * @param {string} expectedValue
 */
function assertGeneratedConstant(source, constantName, expectedValue) {
  const match = new RegExp(`export const ${constantName} = "([^"]+)";`, 'u').exec(source);
  if (match?.[1] !== expectedValue) {
    throw new Error(
      `Generated ${constantName} is ${JSON.stringify(match?.[1])}, expected ${JSON.stringify(expectedValue)}.`,
    );
  }
}

/** @param {string} filePath */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${filePath} is missing or invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
