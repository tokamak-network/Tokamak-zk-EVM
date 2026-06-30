# Tokamak zk-EVM Backend WASM

This package will contain the web-compatible Tokamak zk-EVM prover and verifier implementation.

The initial implementation order is verifier-first. Shared protocol primitives live under `src/libs/`, implementation helpers live under `src/utils/`, and the top-level `src/verifier/` and `src/prover/` directories should only orchestrate those shared modules.

The native ICICLE/arkworks backend remains in `packages/backend`.
