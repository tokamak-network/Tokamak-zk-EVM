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
