# Releasing `@tokamak-zk-evm/cli`

The subcircuit library and its compatible CRS are published locally before a
release PR is merged. A push to `main` then builds the CLI from merged source
and publishes its npm package when that exact version is not already public.

## Before You Merge

1. Synchronize the repository version and add the corresponding dated entry to
   the root `CHANGELOG.md`.
2. Run:

```bash
npm run version:sync -- X.Y.Z
npm run version:check
npm run --workspace @tokamak-zk-evm/cli release:runtime:check
```

## Runtime Installation Invariants

The runtime cache is an implementation artifact of the exact published CLI
version, not an independent compatibility authority. A CLI upgrade requires a
new `--install` run before commands may use the cached backend runtime.

Native installation stages backend binaries, ICICLE resources, and CRS data
outside the active runtime directory. It promotes the staged runtime only after
all preparation succeeds, and restores the prior runtime and installation state
if promotion or state persistence fails. Maintain regression coverage for the
following cases:

```bash
npm run --workspace @tokamak-zk-evm/cli test
```

`installation.json` is the sole selector between native and Docker execution.
Docker's `bootstrap.json` is a subordinate descriptor: the selected Docker
state, descriptor package version, Docker environment, and deterministic image
name must agree before a backend command can run in Docker. A native state must
ignore residual Docker descriptors. Docker installation writes the descriptor
before committing Docker state, so an interrupted install cannot select an
unwritten descriptor. On Linux only, a valid Docker selection may run the
installed native Linux runtime when the Docker daemon is unavailable; malformed
or mismatched Docker descriptors and missing Docker images remain errors.

The CRS installer may replace only its legacy setup directory or an active
symbolic link whose target is under its `generations/` directory. An unmanaged
symbolic link is an installation error and must remain unchanged.

## What Happens On `main`

When a commit reaches `main`,
`.github/workflows/publish-tokamak-zk-evm.yml` validates the published
subcircuit library and CRS, builds the dependent packages, and publishes
missing exact versions in dependency order. An already-published identical
tarball is skipped; a different tarball or an uncertain registry response
stops publication. The CLI is published after the Synthesizer packages.

The root [version and release rules](../../docs/version-rules.md) define the
Changelog date, local prerequisites, and retry behavior.
