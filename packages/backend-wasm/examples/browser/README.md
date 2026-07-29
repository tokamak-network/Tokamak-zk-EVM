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
  its three binary inputs, and generate verifier preprocess bytes.
- [`src/generate-proof.ts`](./src/generate-proof.ts): install the prover, load
  its four binary inputs, and generate proof bytes.
- [`src/verify-proof.ts`](./src/verify-proof.ts): install the verifier, load the
  instance, and verify the generated proof and preprocess bytes.
- [`src/load-binary.ts`](./src/load-binary.ts): fetch one binary artifact and
  reject unsuccessful responses.

[`index.html`](./index.html), [`src/styles.css`](./src/styles.css), and
[`src/global.d.ts`](./src/global.d.ts) support the runnable page rather than
defining separate API recipes.

## Prepare Artifacts

Create `public/artifacts/` and provide the binary files needed by the operations
you intend to run:

| File | Used by |
| --- | --- |
| `permutation.bin` | Preprocess and prover |
| `instance.bin` | Preprocess, prover, and verifier |
| `preprocess-crs.bin` | Preprocess |
| `witness.bin` | Prover |
| `prover-crs.bin` | Prover |

The default URLs in the page point to these names. They can be replaced with
same-origin or CORS-enabled application URLs. The verifier CRS is compiled into
the package and is not an application input.

Prepare runtime binaries with the package converter APIs. In particular,
`convertCrs(combinedSigmaRkyv)` returns the named `proverCrs` and
`preprocessCrs` files used here. Source artifacts and provenance remain the
application's responsibility.

The CRS and witness files are intentionally not included in this example or in
the npm package.

## Additional Recipes

These focused modules are source recipes. They are typechecked and published
with the example, but are not imported by the runnable page:

- [`src/prepare-artifacts.ts`](./src/prepare-artifacts.ts): convert native JSON
  materials and `combined_sigma.rkyv` into the separate runtime binaries.
- [`src/inspect-and-validate.ts`](./src/inspect-and-validate.ts): inspect binary
  metadata and independently validate the same artifact.
- [`src/staged-proof.ts`](./src/staged-proof.ts): execute the ordered prover
  session API and report arithmetic, copy, binding, and finalization progress.
