# Tokamak zk-EVM Synthesizer Packages

This directory is now a container for the split Synthesizer codebase.

## Layout

- `core/`
  - Internal environment-neutral synthesis module.
  - Not published as a standalone npm package.
- `node-cli/`
  - Published as `@tokamak-zk-evm/synthesizer-node`.
  - Owns the Node CLI, RPC helpers, installed subcircuit loading, and filesystem output helpers.
- `web-library/`
  - Published as `@tokamak-zk-evm/synthesizer-web`.
  - Owns the browser-compatible library surface.
- `docs/`
  - Design and architecture documents shared across the split packages.

## Package direction

- The old `@tokamak-zk-evm/synthesizer` package is being retired.
- The current packaging plan is documented in [docs/synthesizer/synthesizer-dual-target-packaging.md](./docs/synthesizer/synthesizer-dual-target-packaging.md).

## Shared rules

- `core/` must stay environment-neutral.
- `node-cli/` and `web-library/` may depend on `core/`.
- `node-cli/` and `web-library/` must not depend on each other.
