# `@tokamak-zk-evm/cli`

`@tokamak-zk-evm/cli` is the npm-distributed Tokamak zk-EVM command-line interface.

The package carries the backend workspace source, installs the frontend npm dependencies, and
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

The package runs a full `tokamak-cli --install` during `postinstall`. This builds the backend
Rust binaries locally on the consumer machine and provisions CRS artifacts unless the install is
explicitly skipped with `TOKAMAK_ZKEVM_SKIP_POSTINSTALL=1`.

## Prerequisites

The consumer machine must provide the local build toolchain required by `--install`:

- Node.js 20 or newer
- npm
- Rust and Cargo
- `curl`, `tar`, and `unzip`
- A C/C++ build toolchain compatible with the local Rust target
- `cmake`

## Runtime Cache

By default the runtime cache is stored under:

```text
~/.tokamak-zk-evm/cli
```

You can override that location with `TOKAMAK_ZKEVM_CLI_CACHE_DIR`.

## Install Source

The package includes a vendored backend workspace under `vendor/workspace/` and uses that source
tree to build the local runtime during `--install`.

## Examples

```bash
tokamak-cli --install
tokamak-cli --synthesize ./L2StateChannel
tokamak-cli --preprocess
tokamak-cli --prove
tokamak-cli --verify
```
