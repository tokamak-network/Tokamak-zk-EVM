# Tokamak zk-EVM Backend WASM

`@tokamak-zk-evm/backend-wasm` is the web-compatible prover and verifier package for the Tokamak zk-EVM backend protocol.

The native backend in `packages/backend` remains the ICICLE/arkworks implementation. This package ports the same custom bivariate-polynomial protocol to TypeScript with browser-compatible runtime dependencies, primarily `ffjavascript` for BLS12-381 field, group, MSM, FFT, and pairing operations.

The implementation is verifier-first. The current package contains shared runtime primitives, parity fixtures, binary artifact loaders, verifier orchestration, and prover stage placeholders that will be filled as the prover port progresses.

## Purpose

This package exists to provide a runtime boundary that can be used from web applications without depending on the native Rust/CUDA backend.

Runtime prover and verifier APIs must consume and produce runtime bundles made of separate binary artifact files plus metadata. JSON, rkyv, native artifact conversion, fixture import, and debug export belong to tooling outside the hot prover and verifier paths.

Runtime subcircuit artifacts come from the `@tokamak-zk-evm/subcircuit-library` package dependency. CRS artifacts are prepared by the embedding application and passed to this package as binary inputs; `src/prover`, `src/verifier`, and runtime loaders must not fetch Google Drive artifacts directly.

## Package Structure

```text
packages/backend-wasm/
  src/
    index.ts
    libs/
      artifact-loaders/
      crypto/
      polynomial/
      runtime/
      serialization/
    prover/
    tools/
      artifact-converters/
    utils/
    verifier/
  scripts/
  fixtures/
  test/
```

### `src/libs/`

Runtime libraries that `src/prover` and `src/verifier` may directly depend on.

- `artifact-loaders/`: binary artifact loading, section lookup, CRS digest types, and runtime artifact validation boundaries.
- `crypto/`: Keccak and transcript primitives matching the native backend byte layout.
- `polynomial/`: bivariate dense polynomial helpers, NTT wrappers, domains, and Lagrange evaluation helpers.
- `runtime/`: `ffjavascript` curve, field, group, pairing, MSM, and random scalar adapters.
- `serialization/`: runtime bundle manifest types, binary artifact file format, section table encoding, schema checks, and digest validation.

### `src/verifier/`

Verifier orchestration for the custom Tokamak protocol. This layer composes `src/libs/` primitives and should not parse JSON, decode rkyv, or perform import/export formatting.

### `src/prover/`

Prover orchestration entry points and stage placeholders. The prover port should preserve the native backend's accepted algorithmic structure and optimization strategy instead of replacing it with a naive expression-only translation.

### `src/tools/`

Web-compatible tooling libraries that are not imported by prover or verifier runtime orchestration. Artifact converters live here so applications or local CLIs can build conversion workflows without putting conversion work in runtime prove/verify paths.

### `src/utils/`

Small generic helpers shared by implementation modules. Protocol logic, artifact conversion, and runtime arithmetic should not be hidden here.

### `scripts/`

Local development and validation scripts. These scripts check fixtures, binary artifact file behavior, runtime arithmetic, polynomial parity, and verifier parity.

`scripts/copy-fixtures.ts` is the only fixture update path in this package. It copies prepared artifacts from owning packages under the monorepo `packages/` directory. It must not generate missing artifacts.

### `fixtures/`

Curated parity fixtures for validating the TypeScript runtime against prepared native outputs. Test fixtures are copy-only; this package must not regenerate fixtures by running native binaries, setup flows, prover flows, verifier flows, or fixture exporters.

### `test/`

Reserved test directories for unit, parity, and integration coverage as the package grows.

## Artifact Policy

Backend-wasm performs binary header, section, digest, schema, runtime encoding, and compatibility checks after npm or Google Drive provenance checks have already been handled by the artifact provider.

In this package, a runtime bundle is a collection of separate binary artifact files plus metadata. It is not one monolithic binary file.

Verifier runtime input is split into two runtime bundles:

- `VerifierProofInput`: separate instance and proof binary artifact files plus related metadata.
- `VerifierSetupInput`: separate CRS and preprocess binary artifact files plus setup/domain/compatibility metadata.

Proof, instance, CRS, and preprocess data must remain in separate binary artifact files.

The `sigma_verify` binary layout must be managed by `src/libs/artifact-loaders/specs/sigma-verify.v1.json`. Loader code should validate against that JSON spec rather than hardcoding the point layout directly.

## Development

```sh
npm run typecheck
npm run typecheck:scripts
npm run fixtures:check
npm run runtime:check
npm run binary:check
npm run polynomial:check
npm run verifier:check
npm run build
npm run clean
```

Use `npm run fixtures:copy` only after the owning packages have prepared the source artifacts listed in `fixtures/small/copy-manifest.json`.

## License

This package is licensed as `GPL-3.0-or-later`.

This is a package-local license decision. Other packages in the Tokamak zk-EVM monorepo may remain licensed under `MIT OR Apache-2.0` unless they explicitly state otherwise.

Permissively licensed packages in this monorepo should not import, bundle, or redistribute `packages/backend-wasm` without reviewing the resulting GPL obligations.
