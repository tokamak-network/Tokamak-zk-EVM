#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(packageRoot, 'dist');
const rootPackageJsonPath = path.resolve(packageRoot, 'package.json');
const readmePath = path.resolve(packageRoot, 'README.md');
const changelogPath = path.resolve(packageRoot, 'CHANGELOG.md');
const tokamakL2jsPackageJsonPath = path.resolve(packageRoot, 'node_modules', 'tokamak-l2js', 'package.json');
const libraryDir = path.resolve(packageRoot, 'subcircuits/library');
const constantsPath = path.resolve(packageRoot, 'subcircuits/circom/constants.circom');

const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));

if (!fs.existsSync(libraryDir)) {
  console.error(`Error: Built library not found at '${libraryDir}'. Run 'npx qap-compiler --build' first.`);
  process.exit(1);
}

if (!fs.existsSync(constantsPath)) {
  console.error(`Error: Constants file not found at '${constantsPath}'. Run 'npx qap-compiler --reload-constants' first.`);
  process.exit(1);
}

if (!fs.existsSync(readmePath)) {
  console.error(`Error: README not found at '${readmePath}'.`);
  process.exit(1);
}

if (!fs.existsSync(changelogPath)) {
  console.error(`Error: CHANGELOG not found at '${changelogPath}'.`);
  process.exit(1);
}

if (!fs.existsSync(tokamakL2jsPackageJsonPath)) {
  console.error(`Error: tokamak-l2js package metadata not found at '${tokamakL2jsPackageJsonPath}'. Run 'npm install' first.`);
  process.exit(1);
}

const publishedPackage = {
  name: rootPackage.name,
  version: rootPackage.version,
  description: rootPackage.description,
  keywords: rootPackage.keywords,
  homepage: rootPackage.homepage,
  repository: rootPackage.repository,
  bugs: rootPackage.bugs,
  license: rootPackage.license,
  publishConfig: rootPackage.publishConfig,
  author: rootPackage.author,
  contributors: rootPackage.contributors,
};

const tokamakL2jsPackage = JSON.parse(fs.readFileSync(tokamakL2jsPackageJsonPath, 'utf8'));
const buildMetadata = {
  tokamakL2js: {
    packageName: tokamakL2jsPackage.name,
    version: tokamakL2jsPackage.version,
  },
};

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(path.join(distDir, 'subcircuits', 'circom'), { recursive: true });

fs.cpSync(libraryDir, path.join(distDir, 'subcircuits', 'library'), {
  recursive: true,
  filter: (sourcePath) => path.basename(sourcePath) !== 'info',
});
fs.copyFileSync(constantsPath, path.join(distDir, 'subcircuits', 'circom', 'constants.circom'));
fs.copyFileSync(readmePath, path.join(distDir, 'README.md'));
fs.copyFileSync(changelogPath, path.join(distDir, 'CHANGELOG.md'));
fs.copyFileSync(path.resolve(packageRoot, 'LICENSE-MIT'), path.join(distDir, 'LICENSE-MIT'));
fs.copyFileSync(path.resolve(packageRoot, 'LICENSE-APACHE'), path.join(distDir, 'LICENSE-APACHE'));
fs.writeFileSync(path.join(distDir, 'build-metadata.json'), `${JSON.stringify(buildMetadata, null, 2)}\n`);
fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(publishedPackage, null, 2)}\n`);

console.log(`[qap-compiler] Copied built library to '${path.join(distDir, 'subcircuits', 'library')}'.`);
console.log(`[qap-compiler] Copied synced constants to '${path.join(distDir, 'subcircuits', 'circom', 'constants.circom')}'.`);
console.log(`[qap-compiler] Wrote build metadata to '${path.join(distDir, 'build-metadata.json')}'.`);
console.log(`[qap-compiler] Wrote publishable package metadata to '${path.join(distDir, 'package.json')}'.`);
console.log(`[qap-compiler] Prepared dist package at '${distDir}'.`);
