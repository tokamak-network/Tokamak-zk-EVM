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

Generate the current scalar fixture from the native backend with:

```sh
cd ../backend
cargo run -p libs --bin export_scalar_fixture -- --output-dir ../backend-wasm/fixtures/small
```

The generated files must remain small and deterministic before they are committed.
