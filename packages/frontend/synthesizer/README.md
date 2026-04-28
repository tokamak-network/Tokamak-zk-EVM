# Tokamak zk-EVM Synthesizer

Tokamak zk-EVM Synthesizer turns a Tokamak L2 transaction snapshot into circuit-ready artifacts for the downstream proving pipeline.

## Packages

- `@tokamak-zk-evm/synthesizer-node`
  - Use this package when you want a Node.js CLI that reads JSON files from disk and writes JSON outputs back to disk.
  - Package docs: [node-cli/README.md](./node-cli/README.md)
- `@tokamak-zk-evm/synthesizer-web`
  - Use this package when you want a browser-facing API that accepts payload objects or uploaded files.
  - Package docs: [web-app/README.md](./web-app/README.md)

The shared synthesis runtime lives in `core/` and is not published as a standalone package.

## Shared Input Model

Both published packages work from the same transaction payload shape:

- `previousState`
- `transaction`
- `blockInfo`
- `contractCodes`

## Shared Output Model

Both packages produce the same synthesized artifacts:

- `placementVariables.json`
- `instance.json`
- `instance_description.json`
- `permutation.json`
- `state_snapshot.json`
- `step_log.json`
- `message_code_addresses.json`

## Runtime Model

- `@tokamak-zk-evm/synthesizer-node` loads `@tokamak-zk-evm/subcircuit-library` from the installed dependency at runtime.
- `@tokamak-zk-evm/synthesizer-web` bundles the published subcircuit-library JSON and WASM artifacts at build time.

## Documentation

- Consumer landing: [README.md](./README.md)
- Repository changelog: [../../../CHANGELOG.md](../../../CHANGELOG.md)
- Maintainer docs index: [docs/README.md](./docs/README.md)

## FAQ

### Which package should I install?

Install `@tokamak-zk-evm/synthesizer-node` for file-based Node.js execution. Install `@tokamak-zk-evm/synthesizer-web` for browser-style runtimes and UI integrations.

### What input does the synthesizer need?

Both packages expect one complete transaction replay payload with `previousState`, `transaction`, `blockInfo`, and `contractCodes`.

### What does the synthesizer emit?

The synthesizer emits circuit-ready placement data, public instances, permutation constraints, the final state snapshot, and execution analysis files.

### How does this relate to `@tokamak-zk-evm/subcircuit-library`?

The synthesizer depends on the published subcircuit library for metadata and WASM artifacts. The Node package resolves those assets from the installed package at runtime, while the web package bundles them at build time.

### Is `core/` a public npm package?

No. `core/` is an internal shared runtime used by both published packages.
