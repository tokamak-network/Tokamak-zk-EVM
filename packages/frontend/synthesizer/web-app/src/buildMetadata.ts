declare const __SYNTH_BUILD_METADATA_JSON__: string | undefined;

export type BuildDependencyMetadata = {
  buildVersion: string;
  declaredRange: string;
  packageName: string;
  runtimeMode: 'bundled' | 'runtime-installed';
};

export type BuildMetadata = {
  dependencies: {
    subcircuitLibrary: BuildDependencyMetadata;
    tokamakL2js: BuildDependencyMetadata;
  };
  packageName: string;
  packageVersion: string;
};

const fallbackBuildMetadata: BuildMetadata = {
  dependencies: {
    subcircuitLibrary: {
      buildVersion: 'unknown',
      declaredRange: 'unknown',
      packageName: '@tokamak-zk-evm/subcircuit-library',
      runtimeMode: 'bundled',
    },
    tokamakL2js: {
      buildVersion: 'unknown',
      declaredRange: 'unknown',
      packageName: 'tokamak-l2js',
      runtimeMode: 'bundled',
    },
  },
  packageName: '@tokamak-zk-evm/synthesizer-web',
  packageVersion: 'development',
};

export const buildMetadata: BuildMetadata =
  typeof __SYNTH_BUILD_METADATA_JSON__ === 'string'
    ? (JSON.parse(__SYNTH_BUILD_METADATA_JSON__) as BuildMetadata)
    : fallbackBuildMetadata;
