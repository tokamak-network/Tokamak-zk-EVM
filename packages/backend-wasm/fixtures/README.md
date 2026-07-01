# Backend WASM Fixtures

This directory will contain curated parity fixtures used to compare the TypeScript implementation against deterministic native Rust outputs.

Large generated artifacts should stay outside git unless they are intentionally selected as minimal fixtures.

## Manifest Format

Each fixture suite has a `manifest.json` file:

```json
{
  "schemaVersion": 1,
  "suite": "small",
  "description": "Minimal deterministic parity fixtures for the verifier-first backend-wasm port.",
  "cases": [
    {
      "id": "scalar-add-basic",
      "kind": "scalar-ops",
      "description": "Checks BLS12-381 Fr addition against the native backend.",
      "input": "input/scalar-add-basic.json",
      "expected": "expected/scalar-add-basic.json"
    }
  ]
}
```

Supported `kind` values are:

- `scalar-ops`
- `roots-of-unity`
- `ntt-1d`
- `ntt-2d`
- `coset-ntt`
- `polynomial-eval`
- `msm`
- `pairing`
- `transcript`
- `full-proof`

Input and expected paths are relative to the manifest directory. They must not be absolute paths or contain parent-directory traversal. Expected files must contain the deterministic native Rust outputs that TypeScript code will compare against.

## Regenerating Native Fixtures

Generate native parity fixtures from the backend helper crate with:

```sh
cd ../backend
cargo run -p export-fixtures --bin export_scalar_fixture -- --output-dir ../backend-wasm/fixtures/small
cargo run -p export-fixtures --bin export_roots_of_unity_fixture -- --output-dir ../backend-wasm/fixtures/small
cargo run -p export-fixtures --bin export_ntt_1d_fixture -- --output-dir ../backend-wasm/fixtures/small
cargo run -p export-fixtures --bin export_ntt_2d_fixture -- --output-dir ../backend-wasm/fixtures/small
cargo run -p export-fixtures --bin export_coset_ntt_fixture -- --output-dir ../backend-wasm/fixtures/small
cargo run -p export-fixtures --bin export_polynomial_eval_fixture -- --output-dir ../backend-wasm/fixtures/small
cargo run -p export-fixtures --bin export_msm_fixture -- --output-dir ../backend-wasm/fixtures/small
cargo run -p export-fixtures --bin export_pairing_fixture -- --output-dir ../backend-wasm/fixtures/small
cargo run -p export-fixtures --bin export_transcript_fixture -- --output-dir ../backend-wasm/fixtures/small
```

Generate the full proof fixture through the CLI runtime path:

```sh
cd ../..
TOKAMAK_ZKEVM_CLI_CACHE_DIR=packages/backend-wasm/tmp/full-proof-runtime \
  node packages/cli/dist/cli.js --install --trusted-setup
TOKAMAK_ZKEVM_CLI_CACHE_DIR=packages/backend-wasm/tmp/full-proof-runtime \
  node packages/cli/dist/cli.js --synthesize packages/frontend/synthesizer/examples/L2StateChannel
TOKAMAK_ZKEVM_CLI_CACHE_DIR=packages/backend-wasm/tmp/full-proof-runtime \
  node packages/cli/dist/cli.js --preprocess
TOKAMAK_ZKEVM_CLI_CACHE_DIR=packages/backend-wasm/tmp/full-proof-runtime \
  node packages/cli/dist/cli.js --prove
TOKAMAK_ZKEVM_CLI_CACHE_DIR=packages/backend-wasm/tmp/full-proof-runtime \
  node packages/cli/dist/cli.js --verify
```

The CLI full-proof fixture must use `trusted-setup --fixed-tau`. Do not run `mpc-setup` for this fixture. Large setup outputs such as `combined_sigma.rkyv` and `sigma_preprocess.rkyv` must remain under `tmp`; only the curated small JSON artifacts belong in git.
