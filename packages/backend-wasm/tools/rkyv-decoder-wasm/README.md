# backend-wasm rkyv decoder

This crate is the Rust/WASM boundary for backend-wasm artifact converter tooling.
It is not prover or verifier runtime code.

The converter API in `src/tools/artifact-converters/rkyv-to-binary.ts` accepts
bytes and delegates native rkyv archive decoding to this package. The decoder must
use the same rkyv version line and archive shapes as the native backend artifacts.

Supported target archive kinds:

- `combined_sigma.rkyv` -> backend-wasm `prover-crs.v1` binary sections.
- `sigma_preprocess.rkyv` -> verifier preprocess source data, only if that path is
  still required after verifier CRS is generated into backend-wasm build output.

This crate intentionally does not implement a generic rkyv decoder. rkyv archives
are Rust type-layout dependent and must be decoded through explicit supported
archive types.
