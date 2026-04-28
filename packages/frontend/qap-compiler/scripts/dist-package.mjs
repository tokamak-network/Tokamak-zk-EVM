#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..', '..');
const distDir = path.resolve(packageRoot, 'dist');
const rootPackageJsonPath = path.resolve(packageRoot, 'package.json');
const readmePath = path.resolve(packageRoot, 'README.md');
const changelogPath = path.resolve(repoRoot, 'CHANGELOG.md');
const libraryDir = path.resolve(packageRoot, 'subcircuits/library');
const constantsPath = path.resolve(packageRoot, 'subcircuits/circom/constants.circom');

const resolvePackageJsonPath = packageName => {
  let currentPath = path.dirname(require.resolve(packageName, { paths: [packageRoot] }));

  while (true) {
    const packageJsonPath = path.join(currentPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      throw new Error(`Could not find package metadata for '${packageName}'.`);
    }
    currentPath = parentPath;
  }
};

const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));

if (!fs.existsSync(libraryDir)) {
  console.error(`Error: Built library not found at '${libraryDir}'. Run 'npx qap-compiler --build' first.`);
  process.exit(1);
}

if (!fs.existsSync(constantsPath)) {
  console.error(
    `Error: Constants file not found at '${constantsPath}'. Run 'npx qap-compiler --reload-constants' first.`,
  );
  process.exit(1);
}

if (!fs.existsSync(readmePath)) {
  console.error(`Error: README not found at '${readmePath}'.`);
  process.exit(1);
}

if (!fs.existsSync(changelogPath)) {
  console.error(`Error: root CHANGELOG not found at '${changelogPath}'.`);
  process.exit(1);
}

let tokamakL2jsPackageJsonPath;
try {
  tokamakL2jsPackageJsonPath = resolvePackageJsonPath('tokamak-l2js');
} catch (error) {
  console.error(
    `Error: tokamak-l2js package metadata could not be resolved. Run 'npm install' first. ${error.message}`,
  );
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
  dependencies: {
    tokamakL2js: {
      buildVersion: tokamakL2jsPackage.version,
      declaredRange: rootPackage.dependencies['tokamak-l2js'],
      packageName: tokamakL2jsPackage.name,
      runtimeMode: 'runtime-installed',
    },
  },
  packageName: rootPackage.name,
  packageVersion: rootPackage.version,
};

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(path.join(distDir, 'subcircuits', 'circom'), { recursive: true });

fs.cpSync(libraryDir, path.join(distDir, 'subcircuits', 'library'), {
  recursive: true,
  filter: sourcePath => path.basename(sourcePath) !== 'info',
});
fs.copyFileSync(constantsPath, path.join(distDir, 'subcircuits', 'circom', 'constants.circom'));
fs.copyFileSync(readmePath, path.join(distDir, 'README.md'));
fs.copyFileSync(changelogPath, path.join(distDir, 'CHANGELOG.md'));
fs.copyFileSync(path.resolve(packageRoot, 'LICENSE-MIT'), path.join(distDir, 'LICENSE-MIT'));
fs.copyFileSync(path.resolve(packageRoot, 'LICENSE-APACHE'), path.join(distDir, 'LICENSE-APACHE'));
fs.writeFileSync(path.join(distDir, 'build-metadata.json'), `${JSON.stringify(buildMetadata, null, 2)}\n`);
fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(publishedPackage, null, 2)}\n`);

console.log(`[qap-compiler] Copied built library to '${path.join(distDir, 'subcircuits', 'library')}'.`);
console.log(
  `[qap-compiler] Copied synced constants to '${path.join(distDir, 'subcircuits', 'circom', 'constants.circom')}'.`,
);
console.log(`[qap-compiler] Wrote build metadata to '${path.join(distDir, 'build-metadata.json')}'.`);
console.log(`[qap-compiler] Wrote publishable package metadata to '${path.join(distDir, 'package.json')}'.`);
console.log(`[qap-compiler] Prepared dist package at '${distDir}'.`);
