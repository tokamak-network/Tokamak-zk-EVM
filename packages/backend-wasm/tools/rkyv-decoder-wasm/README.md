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

`decode_combined_sigma` validates the native `SigmaRkyv` archive shape and returns
a compact section-payload container. TypeScript converter code parses that payload
and remains responsible for writing backend-wasm binary artifact files, file kinds,
section labels, and digest tables.

The crate also exports `decodeCombinedSigma` through `wasm-bindgen`. The generated
JavaScript package should be lazy-loaded by converter tooling rather than imported
by prover or verifier runtime code.

The payload container is an internal Rust/WASM-to-TypeScript adapter format, not a
runtime artifact file and not a persisted fixture format.

## Browser build

Build the browser package from this directory with:

```sh
npm run build
```

From the backend-wasm package root, the same build is available as:

```sh
npm run rkyv-decoder:build
```

The build requires:

- `cargo`
- `rustc` with the `wasm32-unknown-unknown` target installed
- `wasm-bindgen` CLI

The script always rebuilds the Rust WASM target and regenerates `pkg/` from that
target. `pkg/` and `target/` are generated outputs and are not tracked.

To check only whether the required build tools are installed:

```sh
npm run check:build-tools
```

## Browser API

The browser wrapper lazy-loads the generated wasm-bindgen package and exposes the
payload decoder. It does not create backend-wasm runtime artifact files itself.

```js
import { createCombinedSigmaRkyvPayloadDecoder } from "@tokamak-zk-evm/backend-wasm";
import { loadCombinedSigmaPayloadDecoder } from "./tools/rkyv-decoder-wasm/src/browser.js";

const payloadDecoder = await loadCombinedSigmaPayloadDecoder();
const decoder = createCombinedSigmaRkyvPayloadDecoder(payloadDecoder.decodeCombinedSigmaPayload);
```

Pass `decoder` to `convertCombinedSigmaRkyvToProverCrsBinary`. Prover and verifier
runtime modules must not import this package.
