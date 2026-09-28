import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parsePackageVersion } from '../../../../scripts/version-contract.mjs';

const SUBCIRCUIT_LIBRARY_PACKAGE_NAME = '@tokamak-zk-evm/subcircuit-library';

/** @typedef {'bundled' | 'runtime-installed'} RuntimeMode */
/**
 * @typedef {object} BuildDependencyMetadata
 * @property {string} buildVersion
 * @property {string} declaredRange
 * @property {string} packageName
 * @property {RuntimeMode} runtimeMode
 */
/**
 * @typedef {object} PackageBuildMetadata
 * @property {{ subcircuitLibrary: BuildDependencyMetadata, tokamakL2js: BuildDependencyMetadata }} dependencies
 * @property {string} packageName
 * @property {string} packageVersion
 */

/**
 * @param {NodeJS.Require} requireFromPackage
 * @param {string} packageName
 * @param {string} resolutionTarget
 */
function resolveDependencyManifestPath(requireFromPackage, packageName, resolutionTarget) {
  const entryPath = requireFromPackage.resolve(resolutionTarget);
  let currentDir = path.dirname(entryPath);

  while (true) {
    const manifestPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.name === packageName) {
        return manifestPath;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Unable to resolve package.json for '${packageName}'.`);
    }
    currentDir = parentDir;
  }
}

/**
 * @param {string} packageDir
 * @param {{ subcircuitLibrary: RuntimeMode, tokamakL2js: RuntimeMode }} runtimeModes
 * @returns {PackageBuildMetadata}
 */
export function createPackageBuildMetadata(packageDir, runtimeModes) {
  const requireFromPackage = createRequire(path.join(packageDir, 'package.json'));
  const manifestPath = path.join(packageDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const dependencyEntries = Object.entries(runtimeModes).map(([key, runtimeMode]) => {
    const packageName = key === 'subcircuitLibrary' ? '@tokamak-zk-evm/subcircuit-library' : 'tokamak-l2js';
    const resolutionTarget =
      key === 'subcircuitLibrary'
        ? '@tokamak-zk-evm/subcircuit-library/subcircuits/library/setupParams.json'
        : packageName;
    const dependencyManifestPath = resolveDependencyManifestPath(requireFromPackage, packageName, resolutionTarget);
    const dependencyManifest = JSON.parse(fs.readFileSync(dependencyManifestPath, 'utf8'));
    const declaredRange = manifest.dependencies[packageName];

    if (packageName === SUBCIRCUIT_LIBRARY_PACKAGE_NAME) {
      assertExactReleaseLineDependency(manifest.version, declaredRange, dependencyManifest.version, packageDir);
    }

    return [
      key,
      {
        buildVersion: dependencyManifest.version,
        declaredRange,
        packageName,
        runtimeMode,
      },
    ];
  });

  return /** @type {PackageBuildMetadata} */ ({
    dependencies: Object.fromEntries(dependencyEntries),
    packageName: manifest.name,
    packageVersion: manifest.version,
  });
}

/**
 * @param {string} packageVersion
 * @param {string} declaredVersion
 * @param {string} resolvedVersion
 * @param {string} packageDir
 */
export function assertExactReleaseLineDependency(packageVersion, declaredVersion, resolvedVersion, packageDir) {
  try {
    parsePackageVersion(packageVersion);
    parsePackageVersion(declaredVersion);
    parsePackageVersion(resolvedVersion);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid synchronized subcircuit-library version for ${packageDir}: ${message}`);
  }
  if (declaredVersion !== packageVersion) {
    throw new Error(
      `${packageDir} must declare ${SUBCIRCUIT_LIBRARY_PACKAGE_NAME}@${packageVersion} exactly; received ${JSON.stringify(declaredVersion)}.`,
    );
  }
  if (resolvedVersion !== declaredVersion) {
    throw new Error(
      `${packageDir} resolved ${SUBCIRCUIT_LIBRARY_PACKAGE_NAME}@${resolvedVersion}, expected the declared exact version ${declaredVersion}.`,
    );
  }
}

/** @param {PackageBuildMetadata} buildMetadata */
export function createBuildMetadataDefines(buildMetadata) {
  return {
    __SYNTH_BUILD_METADATA_JSON__: JSON.stringify(JSON.stringify(buildMetadata)),
  };
}

/** @param {PackageBuildMetadata} buildMetadata */
export function createBuildMetadataFileContents(buildMetadata) {
  return `${JSON.stringify(buildMetadata, null, 2)}\n`;
}
