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

The default install path also requires outbound HTTPS access to the npm registry, crates.io,
GitHub, GitHub Releases, and Google Drive.

## Prerequisites

The consumer machine must provide the local build toolchain required by `--install`:

- Node.js 20 or newer
- npm
- Rust and Cargo
- `bash`
- `curl`, `tar`, and `unzip`
- A C/C++ build toolchain compatible with the local Rust target
- `cmake`
- `pkg-config` on Linux
- Outbound HTTPS access to the npm registry, crates.io, GitHub, GitHub Releases, and Google Drive

`npm` is required not only for package installation but also during the backend release build.
The backend build scripts resolve and pack the published `@tokamak-zk-evm/subcircuit-library`
package while embedding release metadata.

### macOS

Install Apple developer tools first. Either of the following is acceptable:

- `xcode-select --install`
- a full Xcode installation with the active developer directory configured

```bash
xcode-select --install
brew install node cmake
curl https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
npm install -g @tokamak-zk-evm/cli
```

The macOS install path also uses `install_name_tool` while configuring the packaged backend
runtime, so the selected Apple developer tools must provide `cc`, `c++`, and `install_name_tool`.

### Linux

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl cmake unzip tar pkg-config bash
curl https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
npm install -g @tokamak-zk-evm/cli
```

`build-essential` is the minimum recommended baseline because the backend build uses a native C/C++
toolchain and CMake-driven dependencies.

### Windows

Native Windows installation is not supported. Use WSL2 or Docker.

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
