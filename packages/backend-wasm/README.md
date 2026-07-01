# Tokamak zk-EVM Backend WASM

This package will contain the web-compatible Tokamak zk-EVM prover and verifier implementation.

The initial implementation order is verifier-first. Shared protocol primitives live under `src/libs/`, implementation helpers live under `src/utils/`, and the top-level `src/verifier/` and `src/prover/` directories should only orchestrate those shared modules.

The native ICICLE/arkworks backend remains in `packages/backend`.

## Artifact Sources

Runtime subcircuit artifacts are sourced through the package dependency on `@tokamak-zk-evm/subcircuit-library`. CRS artifacts from Google Drive are not fetched by `src/prover` or `src/verifier`; applications using this package must prepare the required CRS inputs and pass them to the runtime artifact loaders.

Backend-wasm performs its own binary header, section, digest, and compatibility checks after npm or Google Drive provenance checks have already been handled by the artifact provider. If a required artifact section or compatibility marker is missing, backend-wasm must fail with an explicit error.

Test fixtures are copy-only. This package must not regenerate test artifacts by running native binaries, setup flows, prover flows, verifier flows, or fixture exporters.

## License

This package is licensed as `GPL-3.0-or-later`.

This is a package-local license decision. Other packages in the Tokamak zk-EVM monorepo may remain licensed under `MIT OR Apache-2.0` unless they explicitly state otherwise.

Permissively licensed packages in this monorepo should not import, bundle, or redistribute `packages/backend-wasm` without reviewing the resulting GPL obligations.
