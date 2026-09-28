export const SOURCE_PACKAGE_VERSION_TARGETS = Object.freeze([
  'package.json',
  'packages/cli/package.json',
  'packages/frontend/qap-compiler/package.json',
  'packages/frontend/synthesizer/node-cli/package.json',
  'packages/frontend/synthesizer/web-app/package.json',
  'packages/backend/wasm/package.json',
]);

export const SYNCHRONIZED_DEPENDENCY_TARGETS = Object.freeze([
  ['packages/cli/package.json', '@tokamak-zk-evm/synthesizer-node'],
  ['packages/cli/package.json', '@tokamak-zk-evm/subcircuit-library'],
  ['packages/frontend/synthesizer/node-cli/package.json', '@tokamak-zk-evm/subcircuit-library'],
  ['packages/frontend/synthesizer/web-app/package.json', '@tokamak-zk-evm/subcircuit-library'],
  ['packages/backend/wasm/package.json', '@tokamak-zk-evm/subcircuit-library'],
  ['packages/backend/wasm/examples/browser/package.json', '@tokamak-zk-evm/snark-browser-compat'],
]);

export const LOCKFILE_PACKAGE_VERSION_TARGETS = Object.freeze([
  ['package-lock.json', ''],
  ['package-lock.json', 'packages/cli'],
  ['package-lock.json', 'packages/frontend/qap-compiler'],
  ['package-lock.json', 'packages/frontend/synthesizer/node-cli'],
  ['package-lock.json', 'packages/frontend/synthesizer/web-app'],
  ['packages/frontend/qap-compiler/package-lock.json', ''],
  ['packages/backend/wasm/package-lock.json', ''],
]);

export const LOCKFILE_DEPENDENCY_TARGETS = Object.freeze([
  ['package-lock.json', 'packages/cli', '@tokamak-zk-evm/synthesizer-node'],
  ['package-lock.json', 'packages/cli', '@tokamak-zk-evm/subcircuit-library'],
  ['package-lock.json', 'packages/frontend/synthesizer/node-cli', '@tokamak-zk-evm/subcircuit-library'],
  ['package-lock.json', 'packages/frontend/synthesizer/web-app', '@tokamak-zk-evm/subcircuit-library'],
  ['packages/backend/wasm/package-lock.json', '', '@tokamak-zk-evm/subcircuit-library'],
]);

export const OPTIONAL_LOCKFILES = Object.freeze(
  new Set([
    'package-lock.json',
    'packages/frontend/qap-compiler/package-lock.json',
  ]),
);

export const BACKEND_WORKSPACE_PACKAGE_NAMES = Object.freeze([
  'backend-interface',
  'libs',
  'mpc-setup',
  'preprocess',
  'prove',
  'trusted-setup',
  'verify',
]);

export const VERSION_CONSTANT_TARGETS = Object.freeze([
  ['packages/backend/wasm/src/version.ts', 'BACKEND_WASM_PACKAGE_VERSION'],
]);

export const BACKEND_WORKSPACE_MANIFEST = 'packages/backend/Cargo.toml';
export const BACKEND_CARGO_LOCK = 'packages/backend/Cargo.lock';
