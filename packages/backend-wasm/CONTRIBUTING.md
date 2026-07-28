# Contributing to Backend WASM

## Audience

This document is for maintainers developing, testing, and preparing
`@tokamak-zk-evm/snark-browser-compat` for publication. Application integration belongs
in `README.md`.

## Package boundaries

The package exposes only:

- `@tokamak-zk-evm/snark-browser-compat/prover`
- `@tokamak-zk-evm/snark-browser-compat/preprocess`
- `@tokamak-zk-evm/snark-browser-compat/verifier`
- `@tokamak-zk-evm/snark-browser-compat/converter`

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
    preprocess/
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
- `src/preprocess`: independent preprocess lifecycle, permutation-polynomial
  construction, and verifier-preprocess commitment output.
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
npm run preprocess:public-api:check
npm run preprocess:browser:check
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

1. Run `npm run version:sync -- X.Y.Z` at the repository root. This updates
   the package manifest, lockfile declaration, generated version constants,
   and private decoder package together with the other synchronized release
   surfaces.
2. Run `npm run version:check` at the repository root.
3. Regenerate production source and run the complete relevant check set.
4. Build the exact package candidate.
5. Inspect the actual packlist and packed metadata:

   ```sh
   npm pack --dry-run
   ```

6. Confirm that `dist`, README, both package licenses, third-party notices, the
   converter Worker, and decoder WASM are included.
7. Confirm that `test`, `scripts`, `fixtures`, `tools`, `tmp`, diagnostics, and
   copied artifacts are excluded.
8. Exercise the packed package through the browser consumer checks before
   publication.

The package intentionally remains outside the root npm workspace. Its release
build resolves the exact synchronized `@tokamak-zk-evm/subcircuit-library`
version from npm after the release workflow publishes that package.

The repository release workflow validates the latest compatible public CRS,
exports its verified `sigma_verify.json`, rebuilds the embedded verifier CRS,
and uploads `snark-browser-compat-release-tarball`. The workflow does not
automatically publish while the package is absent from npm.

For the first publication:

1. Merge the release PR into `main`.
2. Wait for the `Build browser-compatible SNARK package` job to succeed.
3. Download and extract the `snark-browser-compat-release-tarball` workflow
   artifact.
4. Run `sha256sum --check SHA256SUMS` in the extracted artifact directory.
5. Publish the extracted tarball:

   ```sh
   npm publish --access public --ignore-scripts \
     ./tokamak-zk-evm-snark-browser-compat-X.Y.Z.tgz
   ```

6. Configure npm Trusted Publisher for
   `.github/workflows/publish-tokamak-zk-evm.yml`.

After bootstrap, the same workflow compares the synchronized version with npm
and publishes only a strictly newer package version. npm versions are
immutable; never reuse a published version.

License and redistribution findings for release 2.1.3 are recorded in the
repository's
[`snark-browser-compat-2.1.3-license-audit.md`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/backend-wasm/docs/release/snark-browser-compat-2.1.3-license-audit.md).

Use `npm run clean:temp` to remove package-local temporary output while
preserving `tmp/planning.md`.
