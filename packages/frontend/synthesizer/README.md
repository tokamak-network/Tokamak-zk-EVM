# Tokamak zk-EVM Synthesizer Workspace

This directory is the private workspace root for the split Tokamak zk-EVM Synthesizer codebase.

## Published packages

- `node-cli/`
  - Published as `@tokamak-zk-evm/synthesizer-node`
  - Owns the Node CLI, installed subcircuit loading, and filesystem output helpers
- `web-app/`
  - Published as `@tokamak-zk-evm/synthesizer-web`
  - Owns the browser-facing `synthesize(input)` API and browser output helpers

## Internal module

- `core/`
  - Internal environment-neutral synthesis module
  - Not published as a standalone npm package

## Workspace layout

- `docs/`
  - Maintained developer wiki for architecture, flow, data structures, and packaging
- `.vscode/`
  - Workspace-level debug entrypoints for `node-cli/` and `web-app/`

## Workspace rules

- This directory is not a published npm package.
- Published packages live under `node-cli/` and `web-app/`.
- `core/` must contain source files only.
- Build outputs and installed dependencies belong under the published child packages.
- `core/` must stay environment-neutral.
- `node-cli/` and `web-app/` may depend on `core/`.
- `node-cli/` and `web-app/` must not depend on each other.

## Versioning policy

- `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` use synchronized versions.
- Release notes and package responsibilities should be updated together when either published package changes.

## Documentation

- Overview: [docs/synthesizer/synthesizer.md](./docs/synthesizer/synthesizer.md)
- Packaging and package responsibilities: [docs/synthesizer/synthesizer-dual-target-packaging.md](./docs/synthesizer/synthesizer-dual-target-packaging.md)
