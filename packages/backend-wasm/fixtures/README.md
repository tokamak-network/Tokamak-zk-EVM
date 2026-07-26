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

The copy stage writes the owner-package artifacts to the ignored
`tmp/fixture-work/<suite>/source/` directory. It does not write final runtime
fixtures.

Run the conversion stage with:

```sh
npm run fixtures:prepare
```

The conversion stage invokes the browser-compatible converter APIs and writes
binary runtime bundles under the ignored `small/runtime/` directory.

The prepared suite contains:

- `prover-proof-witness-input`;
- `prover-crs-prepared-data`;
- `verifier-proof-input`;
- `verifier-setup-input`.

If an owner artifact is missing, the copy or conversion command must fail with
the required source path. No fallback generation is permitted.
