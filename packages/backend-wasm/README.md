# Tokamak zk-EVM Backend WASM

This package will contain the web-compatible Tokamak zk-EVM prover and verifier implementation.

The initial implementation order is verifier-first. Shared protocol primitives live under `src/libs/`, implementation helpers live under `src/utils/`, and the top-level `src/verifier/` and `src/prover/` directories should only orchestrate those shared modules.

The native ICICLE/arkworks backend remains in `packages/backend`.

## License

This package is licensed as `GPL-3.0-or-later`.

This is a package-local license decision. Other packages in the Tokamak zk-EVM monorepo may remain licensed under `MIT OR Apache-2.0` unless they explicitly state otherwise.

Permissively licensed packages in this monorepo should not import, bundle, or redistribute `packages/backend-wasm` without reviewing the resulting GPL obligations.
