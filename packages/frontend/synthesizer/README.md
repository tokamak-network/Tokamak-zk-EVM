# Tokamak zk-EVM Synthesizer Packages

This directory is now a container for the split Synthesizer codebase.

## Layout

- `core/`
  - Internal environment-neutral synthesis module.
  - Not published as a standalone npm package.
- `node-cli/`
  - Published as `@tokamak-zk-evm/synthesizer-node`.
  - Owns the Node CLI, RPC helpers, installed subcircuit loading, and filesystem output helpers.
- `web-app/`
  - Published as `@tokamak-zk-evm/synthesizer-web`.
  - Owns the browser-compatible app surface and browser adapters.
- `docs/`
  - Design and architecture documents shared across the split packages.

## Container rule

- This directory is a container only.
- Build outputs, runtime outputs, and installed dependencies should live under `node-cli/` or `web-app/`.
- `core/` should contain source files only.

## Package direction

- The old `@tokamak-zk-evm/synthesizer` package is being retired.
- The current packaging plan is documented in [docs/synthesizer/synthesizer-dual-target-packaging.md](./docs/synthesizer/synthesizer-dual-target-packaging.md).

## Shared rules

- `core/` must stay environment-neutral.
- `node-cli/` and `web-app/` may depend on `core/`.
- `node-cli/` and `web-app/` must not depend on each other.
