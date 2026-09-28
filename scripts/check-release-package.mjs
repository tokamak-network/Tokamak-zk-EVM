#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { findPackageTarball, inspectTarball, queryExactPackage } from './release-registry.mjs';

const options = parseOptions(process.argv.slice(2));
const tarball = findPackageTarball(options.tarballDirectory, options.packageName);
const manifest = readTarballManifest(tarball);
const registry = queryExactPackage(options.packageName, manifest.version);
let shouldPublish;
if (registry.state === 'absent') {
  shouldPublish = true;
} else {
  const identity = inspectTarball(tarball, options.packageName, manifest.version, registry.metadata);
  if (identity.state !== 'exact') throw new Error(`${options.packageName}@${manifest.version}: ${identity.reason}.`);
  shouldPublish = false;
}

const values = {
  package_name: options.packageName,
  local_version: manifest.version,
  published_state: registry.state,
  should_publish: String(shouldPublish),
  tarball,
};
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n') + '\n',
  );
}
console.log(JSON.stringify(values, null, 2));

function parseOptions(argumentsList) {
  const options = {};
  for (const argument of argumentsList) {
    const match = /^--([^=]+)=(.+)$/u.exec(argument);
    if (!match) throw new Error(`Invalid option ${argument}.`);
    options[match[1]] = match[2];
  }
  if (!options['package-name'] || !options['tarball-dir']) {
    throw new Error('--package-name and --tarball-dir are required.');
  }
  return {
    packageName: options['package-name'],
    tarballDirectory: path.resolve(options['tarball-dir']),
  };
}

function readTarballManifest(tarballPath) {
  return JSON.parse(execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], { encoding: 'utf8' }));
}
