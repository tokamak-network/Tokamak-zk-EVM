# Subcircuit Library Generation and Release

Last updated: 2026-09-23

This document describes how the maintainer-side `qap-compiler` workflow relates to the published Tokamak zk-EVM Subcircuit Library package.

## Overview

The published package is the consumer-facing output.

The maintainer-side `qap-compiler` is the generation algorithm and tooling that produces that output from EVM-spec-derived circuit definitions and constants. Consumers use the generated subcircuit library. Maintainers use `qap-compiler` to regenerate it.

## qap-compiler and the Published Library

The relationship is:

`qap-compiler` generation algorithm and tooling -> generated Tokamak zk-EVM Subcircuit Library package

More concretely:

- `qap-compiler` works from the repository's circuit templates, subcircuit definitions, and synced constants.
- Those inputs encode Tokamak zk-EVM behavior derived from the relevant EVM semantics and project-specific circuit design choices.
- The generation flow produces the compiled subcircuit library artifacts that downstream consumers use.
- The published npm package exposes the generated library, not the maintainer-side generation workflow.

## Generation Flow

The maintainer-side flow is:

1. Run `npx qap-compiler --reload-constants`. The command requires and installs
   `tokamak-l2js` `0.2.0`, then updates only `nPrivateMessageInputs` and
   `nPoseidonInputs` in `subcircuits/circom/constants.circom`. The generated
   constants and package metadata must continue to identify exactly `0.2.0`.
2. Build the generated subcircuit library into the ignored local
   `subcircuits/library` directory. The build requires Circom `2.2.3` and
   invokes it with explicit O2 optimization;
   compiler-default, O0, and O1 artifacts are not valid library outputs or
   constraint-measurement baselines.
3. Assemble the publishable `dist` package from the generated library, synced constants, package metadata, and the consumer-facing README.
4. Publish `dist` to npm.

After a library version has been published, release verification uses the exact
tarball fetched from npm as that version's identity. It does not compare a
later local rebuild of `dist` with the immutable published tarball. The PR
source build separately validates circuit generation and provides artifacts
for backend checks. Before the first publication of a version, the npm owner
publishes the locally built `dist` package.

The published `dist` package excludes the build-log-style `info` directory and keeps the consumer-facing artifact surface focused on the generated library outputs and synced constants.

## Capacity changes

Before changing capacity, reproduce a representative supported transaction with
the Synthesizer. A buffer-capacity failure reports the required buffer length,
and a placement-capacity failure reports the required `s` value. These errors
do not make an unsupported EVM feature or execution topology supportable; they
only show that a supported flow exceeds the current circuit capacity.

`S_MAX` in `scripts/configure.js` determines the placement capacity recorded
as `s` in the generated setup parameters. The buffer capacities in
`subcircuits/circom/constants.circom` determine the capacities of transaction,
storage, log, block, EVM, and private-input buffers. `nPrevBlockHashes()`
separately controls the supported block-hash history. Select the smallest
values that cover the intended transaction set, because larger circuit
capacities increase setup material, memory use, and proving work.

After a capacity change, rebuild the library with `npm run build:library` and
follow the [circuit update checklist](../publication/circuit-implementation-reference.md#update-checklist).
The rebuilt library requires matching setup artifacts; a CRS generated for the
previous library must not be reused.

## Published Artifact Surface

The published package contains:

- generated R1CS artifacts
- generated WASM artifacts
- generated JSON metadata
- witness-generation helper scripts
- synced `constants.circom`
- `build-metadata.json` with the `tokamak-l2js` package version used for the generated build
- package metadata and licenses

These published outputs form the consumer-facing subcircuit library surface.

## Versioning and Release

The repository source package remains private. The published npm package is assembled from `dist`.

Versioning rules for this package are:

- npm version changes are synchronized from the root repository version.
- changelog entries are maintained in the root `CHANGELOG.md` and record only changes that affect npm-published package artifacts or their consumer-facing behavior.
- the `dist` package does not include a changelog file; its README links to the root changelog.
- package-specific Git tags use the format `subcircuit-library-vX.Y.Z`.
- package-specific tags are maintained from `1.0.0` onward.
- pre-`1.0.0` history is preserved as reconstructed repository history rather than as package-specific tags.

## Documentation Split

The top-level `README.md` is consumer-facing.

Detailed material lives in `docs/`:

- consumer integration details
- maintainer-side generation and release details
- security audit and reference material
