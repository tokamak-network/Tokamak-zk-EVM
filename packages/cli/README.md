# `@tokamak-zk-evm/cli`

`@tokamak-zk-evm/cli` is the Tokamak zk-EVM command-line interface distributed through npm.

Main commands:

- `--install`
- `--synthesize`
- `--preprocess`
- `--prove`
- `--verify`
- `--extract-proof`
- `--doctor`

## Install

```bash
npm install -g @tokamak-zk-evm/cli
```

The package runs `tokamak-cli --install` during `postinstall` unless
`TOKAMAK_ZKEVM_SKIP_POSTINSTALL=1` is set.

## What You Need

Before running `--install`, make sure the machine has:

- Node.js 20 or newer
- npm
- Rust and Cargo
- `cmake`
- `tar`
- `unzip`
- a working C/C++ toolchain
- outbound HTTPS access to npm, crates.io, GitHub, GitHub Releases, and Google Drive

### macOS

```bash
xcode-select --install
brew install node cmake
curl https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
npm install -g @tokamak-zk-evm/cli
```

### Linux

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl cmake unzip tar pkg-config bash
curl https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
npm install -g @tokamak-zk-evm/cli
```

### Windows

Native Windows installation is not supported. Use WSL2 or Docker.

## Working Directory And Output Files

The CLI reads relative input paths from the directory where you run the command.

Example:

```bash
cd /path/to/project
tokamak-cli --synthesize ./L2StateChannel
```

In that example, `./L2StateChannel` means `/path/to/project/L2StateChannel`.

The CLI does not write synth, preprocess, or prove outputs into your current directory.
It writes them into the runtime cache.

Default cache root:

```text
~/.tokamak-zk-evm/cli
```

You can change that location with `TOKAMAK_ZKEVM_CLI_CACHE_DIR`.

Output locations under the cache:

- `macos/runtime/resource/synthesizer/output`
- `macos/runtime/resource/preprocess/output`
- `macos/runtime/resource/prove/output`
- `macos/runtime/resource/setup/output`
- `linux/runtime/resource/synthesizer/output`
- `linux/runtime/resource/preprocess/output`
- `linux/runtime/resource/prove/output`
- `linux/runtime/resource/setup/output`

`--synthesize` clears the synth output directory before writing new files.

`--extract-proof <OUTPUT_ZIP_PATH>` is different. It writes the zip file to the path you pass on the command line.

## Basic Use

```bash
tokamak-cli --install
tokamak-cli --synthesize ./L2StateChannel
tokamak-cli --preprocess
tokamak-cli --prove
tokamak-cli --verify
```
