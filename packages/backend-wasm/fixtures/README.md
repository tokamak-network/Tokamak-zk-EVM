# Backend WASM Fixtures

This directory will contain curated parity fixtures used to compare the TypeScript implementation against deterministic native Rust outputs.

Large artifacts should stay outside git unless they are intentionally selected as minimal fixtures.

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

## Updating Fixtures

Backend-wasm test fixtures follow a controlled copy-convert-store pipeline. Do not regenerate them from this package by running native scripts, Rust binaries, CLI proof flows, setup commands, or prover/verifier execution.

Developers must prepare the owner package output files referenced by `fixtures/small/copy-manifest.json` in their existing package output locations first. Backend-wasm copies those source files into a package-local ignored work directory:

```sh
npm run fixtures:copy
```

The copy stage writes to `packages/backend-wasm/tmp/fixture-work/<suite>/source/` and does not write final test fixtures. A later conversion stage must convert those copied source artifacts through web-compatible converter APIs and store converted runtime files under this package's ignored fixture directories. If a source file is missing, the copy script fails and reports the exact owner package output path that must be prepared. This package must not fall back to generating the missing artifact.
