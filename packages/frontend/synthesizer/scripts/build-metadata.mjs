import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

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

export function createPackageBuildMetadata(packageDir, runtimeModes) {
  const requireFromPackage = createRequire(path.join(packageDir, 'package.json'));
  const manifestPath = path.join(packageDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const dependencyEntries = Object.entries(runtimeModes).map(([key, runtimeMode]) => {
    const packageName =
      key === 'subcircuitLibrary' ? '@tokamak-zk-evm/subcircuit-library' : 'tokamak-l2js';
    const resolutionTarget =
      key === 'subcircuitLibrary'
        ? '@tokamak-zk-evm/subcircuit-library/subcircuits/library/setupParams.json'
        : packageName;
    const dependencyManifestPath = resolveDependencyManifestPath(
      requireFromPackage,
      packageName,
      resolutionTarget,
    );
    const dependencyManifest = JSON.parse(fs.readFileSync(dependencyManifestPath, 'utf8'));

    return [
      key,
      {
        buildVersion: dependencyManifest.version,
        declaredRange: manifest.dependencies[packageName],
        packageName,
        runtimeMode,
      },
    ];
  });

  return {
    dependencies: Object.fromEntries(dependencyEntries),
    packageName: manifest.name,
    packageVersion: manifest.version,
  };
}

export function createBuildMetadataDefines(buildMetadata) {
  return {
    __SYNTH_BUILD_METADATA_JSON__: JSON.stringify(JSON.stringify(buildMetadata)),
  };
}
