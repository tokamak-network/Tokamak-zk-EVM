# MPC Ceremony Quick Guide for Tokamak zk-EVM

This file is a short operator guide. The public entrypoints are:

- `native_mpc_setup`
- `dusk_backed_mpc_setup`

The lower-level ceremony steps now live in library flow modules and are not the normal user
interface anymore.

## Prerequisites

Before running the ceremony:

- complete the repository prerequisites from the project root README
- ensure the official `circom` compiler is available on `PATH`
- install OpenSSL if required by your platform

Run all commands from:

```bash
cd "$PWD/packages/backend"
```

## Native Mode

All build profiles build the local `packages/frontend/qap-compiler` package and embed the
generated `subcircuits/library` files into the backend binary.

```bash
cargo run --release --bin native_mpc_setup -- \
  --intermediate ./setup/mpc-setup/output/native.intermediate \
  --output ./setup/mpc-setup/output/native.final
```

This wrapper performs:

1. Tokamak phase-1 initialization
2. one native phase-1 contribution
3. phase-2 prepare
4. one phase-2 contribution
5. final CRS file generation

Add `--beacon-mode` in normal builds if you want deterministic beacon-mode sampling instead
of the default random mode.

Non-release example:

```bash
cargo run -p mpc-setup --bin native_mpc_setup -- \
  --intermediate ./setup/mpc-setup/output/native.intermediate \
  --output ./setup/mpc-setup/output/native.final
```

Optional wrapper-only input:

- `--seed-input`

The wrappers are non-interactive. Contributor metadata defaults to empty strings, and the
native phase-1 initialization scalar uses internal randomness instead of prompting on stdin.

## Dusk-Backed Mode

```bash
cargo run --release --bin dusk_backed_mpc_setup -- \
  --intermediate ./setup/mpc-setup/output/dusk.intermediate \
  --output ./setup/mpc-setup/output/dusk.final
```

Optional wrapper-only input:

- `--seed-input`

This wrapper:

1. loads or downloads the pinned Dusk raw powers-of-tau file at `<intermediate>/dusk.response`
2. checks the Google Drive upload configuration from `.env`
3. rejects publication if the target Drive folder already contains a CRS archive for the current backend version
4. verifies the pinned digest and the used tau ranges
5. runs phase-2 prepare
6. runs one phase-2 contribution
7. generates final CRS files
8. zips the final `--output` artifacts plus `build-metadata-mpc-setup.json` and uploads the archive to the configured Google Drive folder
9. validates that publication is running from a release build and that the bundled build metadata
   matches the current `mpc-setup` binary version
10. grants the uploaded archive `anyone with the link = viewer`
11. allows viewers and commenters to download, print, and copy the uploaded archive

Non-release example:

```bash
cargo run -p mpc-setup --bin dusk_backed_mpc_setup -- \
  --intermediate ./setup/mpc-setup/output/dusk.intermediate \
  --output ./setup/mpc-setup/output/dusk.final
```

Required `.env` keys for dusk-backed uploads:

- `TOKAMAK_MPC_DRIVE_FOLDER_ID`
- `TOKAMAK_MPC_DRIVE_OAUTH_CLIENT_JSON_PATH`
- `TOKAMAK_MPC_DRIVE_OAUTH_TOKEN_PATH`

The published folder URL in provenance is derived automatically from
`TOKAMAK_MPC_DRIVE_FOLDER_ID`.
The OAuth client JSON file must be a Google desktop-app client credential file.
On the first publication run, `dusk_backed_mpc_setup` opens a browser window for Google login and
stores the OAuth token at `TOKAMAK_MPC_DRIVE_OAUTH_TOKEN_PATH`.
The authenticated Google account must be able to change sharing permissions on uploaded files as
well as add children to the folder.

## Testing-Mode Builds

Testing mode is selected through the cargo feature, not a runtime flag.

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

## Outputs

The final output folder contains:

- `combined_sigma.rkyv`
- `sigma_preprocess.rkyv`
- `sigma_verify.json`
- `crs_provenance.json`

The deployable CRS is `combined_sigma.rkyv`.

`crs_provenance.json` now also records:

- `generated_at_utc`
- `backend_version`
- `published_folder_url`
- `published_archive_name`
- `crs_download_url`

Cargo emits `build-metadata-mpc-setup.json` into `packages/backend/target/<profile>/`.
Publication is allowed only when that metadata declares
`runtimeMode = bundled` and matches the running `mpc-setup` package version.
