# Backend WASM Runtime Fixtures

This directory contains manifests for the controlled test-artifact
copy-convert-store pipeline. Runtime fixture payloads are local test inputs and
are excluded from Git and package publication.

## Source Ownership

Backend-wasm must not generate missing test artifacts by running native scripts,
Rust binaries, CLI proof flows, setup commands, or prover/verifier execution.
Developers prepare artifacts in their owning packages first. The source paths are
declared in `small/copy-manifest.json`.

Run the copy stage with:

```sh
npm run fixtures:copy
```

When backend-wasm is developed in an independent Git worktree, ignored owner
outputs may exist only in another worktree. Select that worktree explicitly;
the script never searches for one:

```sh
npm run fixtures:copy -- \
  --source-repository-root /absolute/path/to/Tokamak-zk-EVM
```

The copy stage writes the owner-package artifacts to the ignored
`tmp/fixtures/<suite>/source/` directory. It does not write final runtime
fixtures. It also writes `source-metadata.json` with every copied file's source
path, byte length, SHA-256 digest, and the synchronized backend, backend-wasm,
and subcircuit-library versions.

Run the conversion stage with:

```sh
npm run fixtures:prepare
```

The conversion stage invokes the browser-compatible converter APIs and writes
independent binary runtime artifacts under the ignored `small/runtime/`
directory.

The prepared suite contains:

- `witness.bin`;
- `permutation.bin`;
- `instance.bin`;
- `prover-crs.bin`;
- `preprocess-crs.bin`;
- `verifier-crs.bin`;
- `proof.bin`;
- `verifier-preprocess.bin`.

If an owner artifact is missing, the copy or conversion command must fail with
the required source path. No fallback generation is permitted.
