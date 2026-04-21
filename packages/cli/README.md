# `@tokamak-zk-evm/cli`

`@tokamak-zk-evm/cli` installs the Tokamak zk-EVM runtime on the local machine and runs the proof flow from the command line.

Main commands:

- `--install`
- `--synthesize`
- `--preprocess`
- `--prove`
- `--verify`
- `--extract-proof`
- `--doctor`

## Quick Start

```bash
npm install -g @tokamak-zk-evm/cli
tokamak-cli --install
tokamak-cli --synthesize ./L2StateChannel
tokamak-cli --preprocess
tokamak-cli --prove
tokamak-cli --verify
```

## What Do I Need Before `--install`?

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

## What Does `--install` Do?

`--install`:

- builds the local backend binaries
- downloads the ICICLE runtime libraries
- downloads CRS files, unless `--no-setup` is used
- writes everything into the CLI runtime cache

The package runs `tokamak-cli --install` during `postinstall` unless `TOKAMAK_ZKEVM_SKIP_POSTINSTALL=1` is set.

## Which Working Directory Does The CLI Use?

The CLI reads relative input paths from the directory where you run the command.

Example:

```bash
cd /path/to/project
tokamak-cli --synthesize ./L2StateChannel
```

In that example, `./L2StateChannel` means `/path/to/project/L2StateChannel`.

## Where Are Output Files Written?

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

## What Files Does `--synthesize` Need?

If you pass a directory, it must contain:

- `previous_state_snapshot.json`
- `transaction.json`
- `block_info.json`
- `contract_codes.json`

Example:

```bash
tokamak-cli --synthesize ./L2StateChannel
```

You can also pass the files one by one:

```bash
tokamak-cli --synthesize \
  --previous-state ./inputs/previous_state_snapshot.json \
  --transaction ./inputs/transaction.json \
  --block-info ./inputs/block_info.json \
  --contract-code ./inputs/contract_codes.json
```

## What Do `--preprocess`, `--prove`, and `--verify` Read?

If you run them without an argument, they use the files already stored in the runtime cache.

If you pass a directory or zip file:

- `--preprocess` needs `permutation.json` and `instance.json`
- `--prove` needs `placementVariables.json`, `permutation.json`, and `instance.json`
- `--verify` needs `proof.json`, `preprocess.json`, and `instance.json`

Examples:

```bash
tokamak-cli --preprocess
tokamak-cli --prove
tokamak-cli --verify
```

```bash
tokamak-cli --preprocess ./artifacts
tokamak-cli --prove ./artifacts.zip
tokamak-cli --verify ./proof-bundle.zip
```

## What Does `--extract-proof` Produce?

`--extract-proof <OUTPUT_ZIP_PATH>` writes a zip file that includes:

- `proof.json`
- `preprocess.json`
- `instance.json`
- `instance_description.json`
- `benchmark.json` when available

Example:

```bash
tokamak-cli --extract-proof ./proof-bundle.zip
tokamak-cli --verify ./proof-bundle.zip
```

## What Does `--doctor` Check?

`--doctor` checks whether the CLI can find the installed runtime for the current platform.

```bash
tokamak-cli --doctor
```

## Common Questions

### Why Is `--install` Slow?

`--install` builds native Rust binaries on the local machine. The first build is usually the slowest.

### Why Are My Outputs Not In My Project Directory?

Because the CLI writes runtime artifacts into the cache directory, not next to the input files.

### How Do I Move The Cache Directory?

Set `TOKAMAK_ZKEVM_CLI_CACHE_DIR` before running the CLI.

Example:

```bash
export TOKAMAK_ZKEVM_CLI_CACHE_DIR="$HOME/tokamak-cli-cache"
tokamak-cli --install
```

### How Do I Start From A Clean State?

Delete the CLI cache directory and run `tokamak-cli --install` again.
