# Tokamak zk-EVM Backend WASM

`@tokamak-zk-evm/backend-wasm` is the web-compatible prover and verifier package for the Tokamak zk-EVM backend protocol.

The native backend in `packages/backend` remains the ICICLE/arkworks implementation. This package ports the same custom bivariate-polynomial protocol to TypeScript with browser-compatible runtime dependencies, primarily `ffjavascript` for BLS12-381 field, group, MSM, FFT, and pairing operations.

The current implementation contains shared runtime primitives, binary artifact loaders, verifier orchestration, and an integrated prover path. Prover diagnostics still use historical native-stage labels in non-runtime scripts, but production prover code is organized by integrated protocol operations rather than `prove0` through `prove4` stage modules.

## Purpose

This package exists to provide a runtime boundary that can be used from web applications without depending on the native Rust/CUDA backend.

Runtime prover and verifier APIs consume named objects whose properties are separate binary artifact files. They do not accept manifests, file lists, path resolvers, JSON, or rkyv input. Native artifact conversion, optional binary inspection and validation, fixture import, and debug export belong to tooling outside the hot prover and verifier paths.

Runtime subcircuit artifacts come from the `@tokamak-zk-evm/subcircuit-library` package dependency. Verifier CRS data is generated into the package build output, while prover CRS data is prepared by the embedding application and passed to this package as a binary input. `src/prover`, `src/verifier`, and runtime loaders must not fetch Google Drive artifacts directly.

## Package Structure

```text
packages/backend-wasm/
  src/
    index.ts
    artifacts/
      binary/
      runtime/
      specs/
    runtime/
      crypto/
      curve/
      field/
      group/
      pairing/
      polynomial/
      random/
    prover/
      api/
      commitments/
      generated/
      polynomial/
      protocol/
    tooling/
      converters/
      validators/
    verifier/
      api/
      generated/
      protocol/
  scripts/
  fixtures/
  test/
  tools/
```

### `src/runtime/`

Runtime primitives that `src/prover` and `src/verifier` may directly depend on.

- `crypto/`: Keccak and transcript primitives matching the native backend byte layout.
- `curve/`, `field/`, `group/`, `pairing/`, and `random/`: `ffjavascript` adapters for BLS12-381 runtime operations.
- `polynomial/`: bivariate dense polynomial helpers, NTT wrappers, domains, and Lagrange evaluation helpers.

### `src/artifacts/`

Runtime artifact definitions and access helpers.

- `binary/`: binary artifact file format, typed file-kind/version/digest tables, and section table encoding.
- `runtime/`: minimal runtime artifact file loading and typed section lookup.
- `specs/`: JSON source specs and generated TypeScript constants for each binary artifact kind.

### `src/verifier/`

Verifier orchestration for the custom Tokamak protocol.

- `api/`: public binary verifier entrypoint and runtime binary input assembly.
- `protocol/`: verifier equations, challenges, domain context, and verification orchestration.
- `generated/`: build-generated verifier CRS data.
- `internal/`: decoded-input verifier core used by the public API and diagnostics.

This layer composes `src/runtime/` and `src/artifacts/` primitives and should not parse JSON, decode rkyv, or perform import/export formatting.

### `src/prover/`

Prover orchestration entry points and integrated prover implementation.

- `api/`: public binary prover entrypoint, decoded prover orchestration, runtime binary input assembly, and proof output assembly.
- `internal/`: integrated prover orchestration, operation-named protocol computations, witness/state construction, commitment encoding boundary, and package version helpers.
- `generated/`: build-generated subcircuit-library data.

The prover port should preserve the native backend's accepted algorithmic structure and optimization strategy while using web-compatible `ffjavascript` primitives. Production code must not reintroduce `src/prover/stages/` as an architectural boundary.

### `src/tooling/`

Web-compatible tooling libraries that are not imported by prover or verifier runtime orchestration. Artifact converters live here so applications or local CLIs can build conversion workflows without putting conversion work in runtime prove/verify paths.

### `src/utils/`

Small generic helpers shared by implementation modules. Protocol logic, artifact conversion, and runtime arithmetic should not be hidden here.

### `scripts/`

Local fixture and generated-source maintenance wrappers.

- `scripts/fixtures/`: local fixture copy, conversion, and preparation wrappers.
- `scripts/generate/`: generated TypeScript source updaters for artifact specs, subcircuit-library data, and verifier CRS.

`scripts/fixtures/copy-fixtures.ts` performs only the first fixture update stage. It copies source artifacts from existing owner package outputs under `packages/` into the package-local ignored work area under `packages/backend-wasm/tmp/fixture-work/`. It must not generate missing artifacts and must not write final runtime fixture files. `scripts/fixtures/prepare-runtime-fixtures.ts` is the local file I/O wrapper for the current verifier runtime fixture conversion stage and delegates artifact conversion to `src/tooling/converters/`.

### `fixtures/`

Curated parity fixtures for validating the TypeScript runtime against prepared native outputs. Test fixture preparation follows a controlled copy-convert-store pipeline: copy owner package outputs into a package-local temporary work area, convert them through web-compatible converter APIs, then store converted files under this package's ignored fixture directories. This package must not regenerate fixtures by running native binaries, setup flows, prover flows, verifier flows, or fixture exporters.

Fixtures are development assets and are not included in the package distribution whitelist.

### `test/`

Development-only verification assets that are excluded from the package:

- `test/checks/`: grouped validation programs for artifacts, browser behavior,
  fixtures, polynomial operations, prover behavior, and verifier behavior.
- `test/diagnostics/`: targeted diagnostic programs that are not production
  runtime code.

The prover timing-table generator remains under `test/checks/prover/` and is
available through `npm run prover:stage-timing:check`. It is development-only
and excluded from the published package.

### `tools/`

Independent helper packages that are built separately from the TypeScript runtime. `tools/rkyv-decoder-wasm/` owns the Rust/WASM rkyv decoder used by converter tooling and must not be imported by prover or verifier runtime algorithms.

## Artifact Policy

The standalone validator tooling can check binary headers, file kinds, versions, digests, sections, runtime encodings, and artifact specs after npm or Google Drive provenance checks have already been handled by the artifact provider. Prover and verifier runtime algorithms decode their named binary inputs but do not invoke this optional validation API.

The prover input object contains four independently prepared files:

- `witness`: placement-variable and witness material.
- `permutation`: permutation entries.
- `instance`: public instance values.
- `proverCrs`: prover CRS and prepared commitment data.

The verifier input object contains three independently prepared files:

- `proof`: verifier proof.
- `instance`: the same public instance material used by the prover.
- `verifierPreprocess`: verifier preprocessing points.

File identity, `formatVersion`, `sourcePackageVersion`, SHA-256 digests, and cross-file compatibility digests are stored in typed tables inside each binary artifact file. No external manifest is part of the runtime contract. Setup params and verifier CRS are generated into the package build output and are not runtime binary inputs.

The `sigma_verify` binary layout must be managed by `src/artifacts/specs/sigma-verify.v1.json`. Generated verifier CRS data lives in `src/verifier/generated/sigma-verify.generated.ts`; runtime verifier code imports that generated data and must not load JSON assets or verifier CRS files directly.

## Development

```sh
npm run typecheck
npm run typecheck:scripts
npm run fixtures:copy
npm run fixtures:prepare
npm run fixtures:check:native-verifier
npm run binary:check
npm run polynomial:buffer:check
npm run prover:ops:check
npm run prover:witness:check
npm run prover:check
npm run specs:check
npm run verifier:check
npm run build
npm run clean
```

Use `npm run fixtures:copy` only after the existing owner package output files listed in `fixtures/small/copy-manifest.json` have been prepared by their owning packages. The command copies those files into `packages/backend-wasm/tmp/fixture-work/`; it does not convert them or write final runtime fixture files.

Use `npm run fixtures:prepare` after `fixtures:copy` to convert the copied source artifacts into the ignored `fixtures/small/runtime/` files `witness.bin`, `permutation.bin`, `instance.bin`, `prover-crs.bin`, `proof.bin`, and `verifier-preprocess.bin`.

Use `npm run verifier-crs:generate` only after the owner package has prepared `../backend/setup/output/sigma_verify.json`. The underlying generator requires an explicit `--input` path and fails if the source artifact cannot be read. `npm run build` runs this generation step before TypeScript compilation, so verifier builds must not reuse an existing generated CRS file.

Use `npm run specs:generate` after editing JSON specs under `src/artifacts/specs/`.

## License

This package is licensed as `GPL-3.0-or-later`.

This is a package-local license decision. Other packages in the Tokamak zk-EVM monorepo may remain licensed under `MIT OR Apache-2.0` unless they explicitly state otherwise.

Permissively licensed packages in this monorepo should not import, bundle, or redistribute `packages/backend-wasm` without reviewing the resulting GPL obligations.
