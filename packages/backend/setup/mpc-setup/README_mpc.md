# MPC Ceremony Quick Guide for Tokamak zk-EVM

This file is a short operator guide. The public entrypoints are:

- `native_mpc_setup`
- `dusk_backed_mpc_setup`

The lower-level ceremony steps now live in library flow modules and are not the normal user
interface anymore.

## Prerequisites

Before running the ceremony:

- complete the repository prerequisites from the project root README
- ensure the frontend subcircuit library exists
- install OpenSSL if required by your platform

Run all commands from:

```bash
cd "$PWD/packages/backend"
```

## Native Mode

```bash
cargo run --release --bin native_mpc_setup -- \
  --subcircuit-library "$QAP_PATH" \
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

Optional wrapper-only input:

- `--seed-input`

The wrappers are non-interactive. Contributor metadata defaults to empty strings, and the
native phase-1 initialization scalar uses internal randomness instead of prompting on stdin.

## Dusk-Backed Mode

```bash
cargo run --release --bin dusk_backed_mpc_setup -- \
  --subcircuit-library "$QAP_PATH" \
  --intermediate ./setup/mpc-setup/output/dusk.intermediate \
  --output ./setup/mpc-setup/output/dusk.final
```

Optional wrapper-only input:

- `--seed-input`

This wrapper:

1. loads or downloads the pinned Dusk raw powers-of-tau file at `<intermediate>/dusk.response`
2. verifies the pinned digest and the used tau ranges
3. runs phase-2 prepare
4. runs one phase-2 contribution
5. generates final CRS files

## Testing-Mode Builds

Testing mode is selected through the cargo feature, not a runtime flag.

Native:

```bash
cargo run --release --features testing-mode --bin native_mpc_setup -- \
  --subcircuit-library "$QAP_PATH" \
  --intermediate ./setup/mpc-setup/output/native-testing.intermediate \
  --output ./setup/mpc-setup/output/native-testing.final
```

Dusk-backed:

```bash
cargo run --release --features testing-mode --bin dusk_backed_mpc_setup -- \
  --subcircuit-library "$QAP_PATH" \
  --intermediate ./setup/mpc-setup/output/dusk-testing.intermediate \
  --output ./setup/mpc-setup/output/dusk-testing.final
```

## Outputs

The final output folder contains:

- `combined_sigma.rkyv`
- `sigma_preprocess.rkyv`
- `sigma_verify.rkyv`
- `crs_provenance.json`

The deployable CRS is `combined_sigma.rkyv`.
