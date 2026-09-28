# Browser Workflow Example

This example is for application developers integrating
`@tokamak-zk-evm/snark-browser-compat` through Vite. It exposes independent
installation and execution controls for preprocess, prover, and verifier.

## Run

```sh
npm install
npm run dev
```

Open the Vite URL and run preprocess, prove, and verify in order. Each runtime
must be installed explicitly. Preprocess and proof outputs remain in memory for
the page lifetime, and verification requires those exact generated outputs.
Each generated output also has a download link.

## Runnable Workflow Source

The page entry point is [`src/main.ts`](./src/main.ts). It coordinates these
operation-specific modules:

- [`src/run-preprocess.ts`](./src/run-preprocess.ts): install preprocess, load
  selector, permutation, and the required CRS chunks, and generate verifier
  preprocess bytes.
- [`src/generate-proof.ts`](./src/generate-proof.ts): install the prover, load
  its binary inputs and required CRS chunks, and generate proof bytes.
- [`src/verify-proof.ts`](./src/verify-proof.ts): install the verifier, admit
  its fixed configuration binaries, and verify the generated proof and
  preprocess bytes.
- [`src/load-binary.ts`](./src/load-binary.ts): fetch one binary artifact and
  reject unsuccessful responses.
- [`src/load-crs.ts`](./src/load-crs.ts): fetch the CRS manifest and provide
  lazy chunk acquisition to preprocess and prover.

[`index.html`](./index.html), [`src/styles.css`](./src/styles.css), and
[`src/global.d.ts`](./src/global.d.ts) support the runnable page rather than
defining separate API recipes.

## Prepare Artifacts

Create `public/artifacts/` and provide the binary files needed by the operations
you intend to run:

| File                 | Used by                          |
| -------------------- | -------------------------------- |
| `selector.bin`       | Preprocess and prover            |
| `permutation.bin`    | Preprocess and prover            |
| `instance.bin`       | Preprocess, prover, and verifier |
| `witness.bin`        | Prover                           |
| `crs/` manifest and chunks | Preprocess and prover            |

The default URLs in the page point to these names. They can be replaced with
same-origin or CORS-enabled application URLs.

Prepare ordinary runtime binaries with the package converter APIs. The example
package does not define the converter script, so run it from the parent WASM
package:

```sh
cd packages/backend/wasm
npm run univariate-crs:convert -- \
  --tau-sequence ../rust/setup/output/crs/tau_sequence.rkyv \
  --keys ../rust/setup/output/crs \
  --output ./tmp/browser-crs
```

The command converts the native Phase 1 `tau_sequence.rkyv` and the Phase 2
directory containing `prover_keys.rkyv`, `preprocess_keys.rkyv`, and
`verifier_keys.rkyv`. Copy its complete output directory to
`examples/browser/public/artifacts/crs/`. Source artifact authentication
remains the application's responsibility.

The CRS and witness files are intentionally not included in this example or in
the npm package.

## Additional Recipes

These focused modules are source recipes. They are typechecked and published
with the example, but are not imported by the runnable page:

- [`src/prepare-artifacts.ts`](./src/prepare-artifacts.ts): convert synthesizer
  JSON materials and attach an already converted chunked CRS source.
- [`src/inspect-and-validate.ts`](./src/inspect-and-validate.ts): inspect binary
  metadata and independently validate the same artifact.

## License

This example is dual-licensed under `MIT OR Apache-2.0`. Dependencies retain
their own licenses.
