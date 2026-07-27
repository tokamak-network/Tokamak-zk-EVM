# Contributing to Backend WASM

## Audience

This document is for maintainers developing, testing, and preparing
`@tokamak-zk-evm/backend-wasm` for publication. Application integration belongs
in `README.md`.

## Package boundaries

The package exposes only:

- `@tokamak-zk-evm/backend-wasm/prover`
- `@tokamak-zk-evm/backend-wasm/verifier`
- `@tokamak-zk-evm/backend-wasm/converter`

Internal runtime, protocol, generated, and binary implementation modules are
not public APIs. See
[`docs/architecture/package-boundaries.md`](./docs/architecture/package-boundaries.md)
before changing dependency direction or publication contents.

## Repository structure

```text
packages/backend-wasm/
  docs/
    architecture/
    optimization/
    release/
  fixtures/
  scripts/
    fixtures/
    generate/
    package/
  src/
    artifacts/
    converter/
    prover/
    runtime/
    verifier/
  test/
  tools/
    rkyv-decoder-wasm/
  tmp/
```

- `src/artifacts`: binary containers, decoded views, and versioned specs.
- `src/converter`: public converter API, material conversion, optional
  inspection and validation, and the prover CRS Worker.
- `src/prover`: public prover lifecycle and integrated protocol operations.
- `src/runtime`: shared ffjavascript-backed field, curve, group, pairing,
  transcript, random, and polynomial infrastructure.
- `src/verifier`: public verifier lifecycle and verification protocol math.
- `scripts`: generated-source, fixture-copy, and package-maintenance commands.
- `test`: checks, browser entry points, diagnostics, and test-only references.
- `tools/rkyv-decoder-wasm`: Rust/WASM decoder source built into the converter.
- `tmp`: ignored planning, benchmark, audit, and other temporary output.

## Prerequisites

- Node.js 20 or newer
- npm
- Rust and Cargo
- the `wasm32-unknown-unknown` Rust target
- `wasm-bindgen-cli` matching the decoder crate's wasm-bindgen version

Install JavaScript dependencies from this package directory:

```sh
npm install
```

Check the Rust/WASM build prerequisites:

```sh
npm run rkyv-decoder:check-tools
```

## Generated production source

Do not edit generated production files manually. Maintain them through:

```sh
npm run specs:generate
npm run subcircuit-library:generate
npm run verifier-crs:generate
```

The subcircuit generator reads the pinned
`@tokamak-zk-evm/subcircuit-library` dependency. The verifier CRS generator
requires the explicit native owner path
`../backend/setup/output/sigma_verify.json`. Every production build regenerates
these inputs instead of reusing a stale verifier CRS.

## Test fixture policy

Fixture preparation copies existing owner-package outputs. It must not run
native setup, preprocess, prove, verifier, QAP compilation, or synthesizer
programs.

Prepare the required owner outputs first, then run:

```sh
npm run fixtures:copy
npm run fixtures:prepare
```

Source copies are written under ignored `tmp/fixtures/`. Converted test
artifacts are written under ignored `fixtures/small/runtime/`. Missing owner
artifacts must fail explicitly; do not add generated fallbacks.

## Checks

Run focused checks while developing:

```sh
npm run typecheck
npm run typecheck:scripts
npm run specs:check
npm run binary:check
npm run prover:ops:check
npm run prover:witness:check
npm run verifier:check
npm run prover:check
npm run verifier:browser:check
npm run prover:browser:check
npm run converter:browser:check
npm run docs:examples:check
npm run build
```

`npm run prover:stage-timing:check` is the retained development-only timing
table generator. Timing, diagnostics, tests, fixtures, scripts, tools, and
`tmp` output must not enter the npm tarball.

Optimization work must preserve the benchmark and correctness requirements in
the repository's
[`prover-optimization-history.md`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/backend-wasm/docs/optimization/prover-optimization-history.md).

## Publication preparation

1. Keep the backend-wasm version aligned with the Tokamak zk-EVM release line.
2. Regenerate production source and run the complete relevant check set.
3. Build the exact package candidate.
4. Inspect the actual packlist and packed metadata:

   ```sh
   npm pack --dry-run
   ```

5. Confirm that `dist`, README, both package licenses, third-party notices, the
   converter Worker, and decoder WASM are included.
6. Confirm that `test`, `scripts`, `fixtures`, `tools`, `tmp`, diagnostics, and
   copied artifacts are excluded.
7. Exercise the packed package through the browser consumer checks before
   publication.

License and redistribution findings for release 2.1.3 are recorded in the
repository's
[`backend-wasm-2.1.3-license-audit.md`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/backend-wasm/docs/release/backend-wasm-2.1.3-license-audit.md).

Use `npm run clean:temp` to remove package-local temporary output while
preserving `tmp/planning.md`.
