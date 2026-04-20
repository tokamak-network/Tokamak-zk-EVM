# `@tokamak-zk-evm/cli`

`@tokamak-zk-evm/cli` is the npm-distributed Tokamak zk-EVM command-line interface.

The package downloads prebuilt release runtimes from GitHub Releases into a local cache and
orchestrates the same high-level commands exposed by `tokamak-cli`:

- `--install`
- `--synthesize`
- `--preprocess`
- `--prove`
- `--verify`
- `--extract-proof`
- `--doctor`

## Installation

```bash
npm install -g @tokamak-zk-evm/cli
```

## Runtime Cache

By default the runtime cache is stored under:

```text
~/.tokamak-zk-evm/cli
```

You can override that location with `TOKAMAK_ZKEVM_CLI_CACHE_DIR`.

## Release Selection

By default `--install` downloads the newest GitHub release from
`tokamak-network/Tokamak-zk-EVM` that contains the required runtime assets for
your platform and install mode.

To pin a specific release tag, set:

```bash
export TOKAMAK_ZKEVM_RELEASE_TAG=<release-tag>
```

## Examples

```bash
tokamak-cli --install
tokamak-cli --synthesize ./L2StateChannel
tokamak-cli --preprocess
tokamak-cli --prove
tokamak-cli --verify
```
