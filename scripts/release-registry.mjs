import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const registry = 'https://registry.npmjs.org';

export function queryExactPackage(name, version, run = runNpmView) {
  const spec = `${name}@${version}`;
  return interpretNpmViewResult(spec, run(spec));
}

export function interpretNpmViewResult(spec, result) {
  if (result.status !== 0) {
    if (/\bE404\b/u.test(String(result.stderr))) return { state: 'absent' };
    throw new Error(`npm registry lookup failed for ${spec}: ${String(result.stderr).trim() || 'unknown error'}`);
  }

  let metadata;
  try {
    metadata = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`npm returned malformed metadata for ${spec}: ${error.message}`);
  }
  if (metadata === null || typeof metadata !== 'object') {
    throw new Error(`npm returned non-object metadata for ${spec}.`);
  }
  if (typeof metadata.integrity !== 'string') {
    throw new Error(`npm metadata for ${spec} is missing dist.integrity.`);
  }
  assertCanonicalIntegrity(spec, metadata.integrity);
  return { state: 'exact', metadata };
}

export function inspectTarball(tarballPath, expectedName, expectedVersion, registryMetadata) {
  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], { encoding: 'utf8' }),
  );
  if (manifest.name !== expectedName || manifest.version !== expectedVersion) {
    return { state: 'mismatch', reason: 'tarball package identity differs from the release identity' };
  }
  const integrity = `sha512-${createHash('sha512').update(fs.readFileSync(tarballPath)).digest('base64')}`;
  if (integrity !== registryMetadata.integrity) {
    return { state: 'mismatch', reason: 'source-built tarball integrity differs from npm' };
  }
  return { state: 'exact', metadata: registryMetadata };
}

export function findPackageTarball(directory, packageName) {
  const matches = fs
    .readdirSync(directory)
    .filter(file => file.endsWith('.tgz'))
    .map(file => path.join(directory, file))
    .filter(file => {
      const manifest = JSON.parse(
        execFileSync('tar', ['-xOf', file, 'package/package.json'], { encoding: 'utf8' }),
      );
      return manifest.name === packageName;
    });
  if (matches.length !== 1) {
    throw new Error(`Expected one source-built tarball for ${packageName}, found ${matches.length}.`);
  }
  return matches[0];
}

function runNpmView(spec) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npm, ['view', spec, 'dist', '--json', `--registry=${registry}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function assertCanonicalIntegrity(spec, integrity) {
  const digest = Buffer.from(integrity.slice('sha512-'.length), 'base64');
  if (
    !integrity.startsWith('sha512-') ||
    digest.length !== 64 ||
    `sha512-${digest.toString('base64')}` !== integrity
  ) {
    throw new Error(`npm metadata for ${spec} must contain canonical SHA-512 integrity.`);
  }
}
