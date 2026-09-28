# Backend WASM runtime fixtures

This directory contains manifests for the controlled test-artifact
copy-convert-store pipeline. Runtime fixture payloads are local test inputs and
are excluded from Git and package publication.

## Workflow

Backend-wasm must not generate missing test artifacts by running native scripts,
Rust binaries, CLI proof flows, setup commands, or prover/verifier execution.
Developers prepare artifacts in their owning packages first. The source paths are
declared in [`small/copy-manifest.json`](./small/copy-manifest.json). See the
[runtime artifact guide](../README.md#runtime-artifact-guide-and-acquisition)
for the role and production source of each artifact kind.

1. Copy owner-package outputs:

   ```sh
   npm run fixtures:copy
   ```

   In an independent worktree, select the worktree containing ignored owner
   outputs explicitly:

   ```sh
   npm run fixtures:copy -- \
     --source-repository-root /absolute/path/to/Tokamak-zk-EVM
   ```

   This writes source files under ignored `tmp/fixtures/<suite>/source/` plus
   `source-metadata.json` with paths, sizes, digests, and package versions.

2. Convert the copied files:

   ```sh
   npm run fixtures:prepare
   ```

   This invokes the public JSON converter APIs and the native mmap CRS
   converter, then writes runtime inputs under ignored `small/runtime/`.

## Prepared outputs

`witness.bin`, `selector.bin`, `permutation.bin`, `instance.bin`, the `crs/`
manifest-and-chunk directory, `proof.bin`, and `verifier-preprocess.bin`.

If an owner artifact is missing, the copy or conversion command must fail with
the required source path. No fallback generation is permitted.
