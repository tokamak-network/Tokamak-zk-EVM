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
packages/backend/wasm/
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
  tmp/
```

- `src/artifacts`: binary containers, decoded views, and versioned specs.
- `src/converter`: public converter API, material conversion, optional
  inspection, and validation.
- `src/generated`: ignored projections generated from backend-owned contracts,
  setup inputs, and dependency-version authorities.
- `src/preprocess`: independent preprocess lifecycle, permutation-polynomial
  construction, and verifier-preprocess commitment output.
- `src/prover`: public prover lifecycle and integrated protocol operations.
- `src/runtime`: shared ffjavascript-backed field, curve, group, pairing,
  transcript, random, and polynomial infrastructure.
- `src/verifier`: public verifier lifecycle and verification protocol math.
- `scripts`: generated-source, fixture-copy, and package-maintenance commands.
- `test`: checks, browser entry points, diagnostics, and test-only references.
- `tmp`: ignored planning, benchmark, audit, and other temporary output.

## Prerequisites

- Node.js 20 or newer
- npm
- Rust and Cargo

Install JavaScript dependencies from this package directory:

```sh
npm install
```

## Generated build inputs

Do not edit generated inputs manually. `npm run contracts:prepare` regenerates
the ignored contract projections under `src/generated`. The other generators
write ignored active outputs under `src/generated/active`,
`src/prover/generated/active`, and `src/verifier/generated/active`; compilation
consumes both the contract projections and those selected active outputs.
Both build modes compile the same optimized package output. Their only input
selection difference is the subcircuit-library source.

Development selects local qap-compiler output:

```sh
npm run build:development
npm run typecheck:development
```

Production selects the pinned npm `@tokamak-zk-evm/subcircuit-library`
snapshot:

```sh
npm run build:production
npm run typecheck:production
```

The CRS is not embedded in either build. Native trusted setup emits a directory
containing `tau_sequence.rkyv`, `prover_keys.rkyv`, `preprocess_keys.rkyv`, and
`verifier_keys.rkyv`.
The offline converter turns that directory into a manifest and bounded chunks;
applications supply the resulting manifest and lazy chunk loader at runtime.
`prepack` always runs the production build, so it cannot reuse a locally
generated subcircuit-library projection.

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
npm run contracts:check
npm run binary:check
npm run prover:ops:check
npm run preprocess:check
npm run preprocess:public-api:check
npm run verifier:browser:check
npm run prover:browser:check
npm run converter:browser:check
npm run docs:examples:check
npm run build
```

The former standalone stage-timing checker is not part of the current package
scripts. Current proof correctness is checked by `npm run prover:browser:check`,
and retained timing evidence is recorded in
[`prover-optimization-history.md`](docs/optimization/prover-optimization-history.md).
Timing, diagnostics, tests, fixtures, scripts, tools, and `tmp` output must not
enter the npm tarball.

Optimization work must preserve the benchmark and correctness requirements in
the repository's
[`prover-optimization-history.md`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/backend/wasm/docs/optimization/prover-optimization-history.md).

## Publication preparation

1. Run `npm run version:sync -- X.Y.Z` at the repository root. This updates
   the tracked package manifests, lockfile declarations, source version
   constants together with the other synchronized release surfaces.
2. Before foundation publication, run
   `npm run version:prepublication:check` at the repository root. This check
   does not require an npm resolution for the unpublished foundation package.
3. Publish the exact synchronized `@tokamak-zk-evm/subcircuit-library` package
   locally and upload its compatible CRS through the local MPC workflow.
4. Run `npm run version:production-snapshot:refresh` at the repository root.
   Commit the resulting `packages/backend/wasm/package-lock.json` change to the
   release branch, then run `node scripts/check-version-sync.mjs`. The active
   generated setup module is ignored and is not part of this commit.
5. Regenerate production inputs with `npm run build:production`, run
   `npm run version:production-snapshot:check` at the repository root, and run
   the relevant production package checks.
6. Build the exact package candidate.
7. Inspect the actual packlist and packed metadata:

   ```sh
   npm pack --dry-run
   ```

8. Confirm that `dist`, README, both package licenses, third-party notices, the
   converter Worker, and decoder WASM are included.
9. Confirm that `test`, `scripts`, `fixtures`, `tools`, `tmp`, diagnostics, and
   copied artifacts are excluded.
10. Exercise the packed package through the browser consumer checks before
    publication:

    ```sh
    npm run converter:browser:check
    npm run converter:crs:browser:check
    npm run converter:webpack:check
    ```

    `converter:crs:browser:check` requires the copied and prepared owner
    fixtures described above. These consumer checks are separate from the
    minimum checks in the publishing workflow.

The package intentionally remains outside the root npm workspace. Its release
build resolves the exact synchronized `@tokamak-zk-evm/subcircuit-library`
version from npm after the npm owner publishes that package locally.

`docs:development-package:check` validates documentation and a package built
from local QAP and an explicit development four-file CRS. It is not a
publication-candidate check. The publishing workflow runs
`package:publication:check` after `build:production`; that command requires
packed active setup metadata to identify the npm snapshot.

On each `main` push, the workflow downloads and hash-checks the compatible CRS
through read-only Drive access, checks its compatibility with the published
library, builds the browser package from merged source, and publishes an absent
exact version. An identical public version is skipped; a different tarball
stops publication because npm versions are immutable.

For a synchronized release:

1. Run the root version synchronization and validation commands.
2. Require the PR `Source build` and public CRS readiness checks to pass, then
   review and merge the release PR into `main`.
3. Confirm that the main-push workflow succeeds and the exact browser package
   version is public on npm.

License and redistribution findings for release 2.1.4 are recorded in the
repository's
[`snark-browser-compat-2.1.4-license-audit.md`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/backend/wasm/docs/release/snark-browser-compat-2.1.4-license-audit.md).

Use `npm run clean:temp` to remove package-local temporary output. Local
planning and audit records are temporary files and are not release artifacts.
