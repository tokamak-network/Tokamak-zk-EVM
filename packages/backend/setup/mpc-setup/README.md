# MPC Setup Guide for Tokamak zk-EVM

`mpc-setup` now exposes two user-facing entrypoints only:

- `native_mpc_setup`
- `dusk_backed_mpc_setup`

Both binaries are thin CLI wrappers. The ceremony logic lives in library flow modules under
[`src/flows`](./src/flows).

## Overview

The final CRS output format is identical in both modes. Only the phase-1 source differs.

- `native_mpc_setup`
  - Runs the Tokamak x-only phase-1 flow and then the Tokamak phase-2 flow.
- `dusk_backed_mpc_setup`
  - Skips Tokamak phase 1 and derives the phase-2 source from a pinned Dusk Groth16 raw
    powers-of-tau artifact.

Both wrappers write:

- intermediate ceremony artifacts to `--intermediate`
- final trusted-setup-compatible artifacts to `--output`

## Prerequisites

Before running the ceremony:

- follow the repository prerequisites from the project root README
- ensure the frontend subcircuit library exists for non-release builds
- install OpenSSL if required by your platform

Run all commands from:

```bash
cd "$PWD/packages/backend"
```

## Native Mode

Release builds resolve the latest `@tokamak-zk-evm/subcircuit-library` npm package during build
time, embed it into the binary, and no longer accept `--subcircuit-library` at runtime. Non-release
builds still require `--subcircuit-library`.

```bash
cargo run --release --bin native_mpc_setup -- \
  --intermediate ./setup/mpc-setup/output/native.intermediate \
  --output ./setup/mpc-setup/output/native.final
```

Use `--beacon-mode` to switch the normal build from random sampling to deterministic
seed-based beacon mode.

Optional wrapper-only input:

- `--seed-input`

The wrappers are non-interactive. Contributor metadata defaults to empty strings, and the
native phase-1 initialization scalar uses internal randomness when testing mode is not enabled.

## Dusk-Backed Mode

```bash
cargo run --release --bin dusk_backed_mpc_setup -- \
  --intermediate ./setup/mpc-setup/output/dusk.intermediate \
  --output ./setup/mpc-setup/output/dusk.final
```

Optional wrapper-only input:

- `--seed-input`

In dusk-backed mode:

- the raw Dusk artifact path is fixed to `<intermediate>/dusk.response`
- if the file is missing, the wrapper downloads the pinned Dusk contribution
- the downloaded or local file must match the pinned SHA-256 digest compiled into the binary
- the used G1 and G2 tau ranges are verified before phase 2 begins
- before setup starts, the wrapper checks that the Google Drive upload environment is valid
- after setup succeeds, the wrapper zips the final `--output` artifacts and uploads the archive to
  the configured Google Drive folder
- the uploaded zip also includes `build-metadata-mpc-setup.json`
- upload is only allowed in release builds with embedded subcircuit library assets
- before uploading, the wrapper validates that `build-metadata-mpc-setup.json` matches the running
  `mpc-setup` binary version and uses `runtimeMode = bundled`
- the output archive name always includes the backend version and CRS generation timestamp

The current pinned Dusk source is:

- contribution: `0015`
- README:
  `https://raw.githubusercontent.com/dusk-network/trusted-setup/main/contributions/0015/README.md`
- drive file id: `1nv9WpxXWMiP8-YwImd2FVn523u7_sb48`

## Dusk Upload Environment

`dusk_backed_mpc_setup` reads its publish configuration from `.env`.

Required keys:

- `TOKAMAK_MPC_DRIVE_FOLDER_ID`
- `TOKAMAK_MPC_DRIVE_SERVICE_ACCOUNT_JSON_PATH`

The service account JSON file must have permission to add children to the configured folder.
The published folder URL recorded in provenance is derived automatically from
`TOKAMAK_MPC_DRIVE_FOLDER_ID`.
If preflight fails or the upload fails, the whole dusk-backed setup run fails.

## Testing-Mode Builds

Like `trusted-setup`, `mpc-setup` uses the `testing-mode` cargo feature instead of a
runtime testing flag.

Native:

```bash
cargo run --release --features testing-mode --bin native_mpc_setup -- \
  --intermediate ./setup/mpc-setup/output/native-testing.intermediate \
  --output ./setup/mpc-setup/output/native-testing.final
```

Dusk-backed:

```bash
cargo run --release --features testing-mode --bin dusk_backed_mpc_setup -- \
  --intermediate ./setup/mpc-setup/output/dusk-testing.intermediate \
  --output ./setup/mpc-setup/output/dusk-testing.final
```

## Output Layout

The intermediate directory contains ceremony state such as:

- `phase1_acc_*`
- `phase1_proof_*`
- `phase2_acc_*`
- `phase2_proof_*`
- contributor metadata files
- `dusk.response` in dusk-backed mode

The final output directory contains only:

- `combined_sigma.rkyv`
- `sigma_preprocess.rkyv`
- `sigma_verify.rkyv`
- `crs_provenance.json`

This matches the trusted-setup artifact set, with the additional provenance manifest.

For release builds, Cargo also emits `build-metadata-mpc-setup.json` into
`packages/backend/target/release/`.

## CRS Provenance

`crs_provenance.json` is a final output artifact. Service-side loaders should reject a CRS
unless this manifest matches both the pinned Dusk source and the exact final CRS bytes.

For every CRS, the manifest also records:

- `generated_at_utc`
- `backend_version`

For dusk-backed mode, the manifest records:

- the canonical local source path
- the pinned Dusk contribution metadata
- the expected and actual Dusk raw SHA-256 digest
- whether the file was auto-downloaded
- whether used-range tau verification succeeded
- the maximum G1 and G2 exponents consumed by Tokamak phase 2
- the Google Drive folder URL used for publication
- the uploaded archive file name
- the SHA-256 digests of:
  - `combined_sigma.rkyv`
  - `sigma_preprocess.rkyv`
  - `sigma_verify.rkyv`

## Service-Side Provenance Verification

When serving a dusk-backed CRS, the service wrapper should verify:

1. the pinned Dusk source metadata
2. the pinned Dusk raw SHA-256
3. the final CRS file hashes
4. the expected published folder URL, if the deployment relies on the automated upload path

Example checks:

```bash
jq -r '.phase1_source_provenance.DuskGroth16.pinned_contribution' "$CRS_DIR/crs_provenance.json"
jq -r '.phase1_source_provenance.DuskGroth16.expected_source_sha256' "$CRS_DIR/crs_provenance.json"
jq -r '.generated_at_utc' "$CRS_DIR/crs_provenance.json"
jq -r '.backend_version' "$CRS_DIR/crs_provenance.json"
jq -r '.published_folder_url' "$CRS_DIR/crs_provenance.json"
jq -r '.published_archive_name' "$CRS_DIR/crs_provenance.json"
jq -r '.combined_sigma_sha256' "$CRS_DIR/crs_provenance.json"
shasum -a 256 "$CRS_DIR/combined_sigma.rkyv"
```

The service wrapper must compare the digest recorded in the manifest against the digest of
the exact file it is about to load.

## Current Notes

- The Tokamak phase-1 contract is x-only.
- `y` is introduced during phase 2.
- Later phase-2 contributors validate the disclosed `y`, but the first phase-2 step still
  determines that value.
- Downstream `preprocess`, `prove`, and `verify-rust` continue to consume the same final CRS
  layout as before.

## Future Work

`dusk_backed_mpc_setup` is still a single-party phase-2 wrapper. It is convenient for local
generation and deployment preparation, but it is not a substitute for a real multi-party
phase-2 ceremony. A production ceremony that requires distributed phase-2 trust must split
the phase-2 contribution flow across multiple independent operators.
