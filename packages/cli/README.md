# `@tokamak-zk-evm/cli`

`@tokamak-zk-evm/cli` installs the Tokamak zk-EVM runtime on the local machine and runs the proof flow from the command line.

Main commands:

- `--install`
- `--install --docker`
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

For `--install --docker`, the Linux host or Windows host with Docker Desktop needs Docker installed and a running Docker daemon. CUDA is enabled only when `docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi` succeeds.

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

Docker installation is also available on Linux and Windows with Docker Desktop:

```bash
tokamak-cli --install --docker
```

### Windows

Native Windows installation is not supported. Use WSL2, or install through Docker Desktop:

```powershell
npm install -g @tokamak-zk-evm/cli
tokamak-cli --install --docker
```

## What Does `--install` Do?

`--install`:

- builds the local backend binaries
- downloads the ICICLE runtime libraries, reusing cached tarballs only when their SHA-256 hashes match the packaged manifest
- downloads CRS files, unless `--no-setup` is used, reusing cached CRS output only when `crs_provenance.json` version and artifact hashes match the latest CRS
- retries the anonymous CRS download up to 5 times, then fails
- writes everything into the CLI runtime cache

`--install --docker` is supported on Linux hosts and Windows hosts with Docker Desktop. It uses the static Dockerfile shipped in the npm package, checks that Docker is running, probes CUDA with `docker run --rm --gpus all ... nvidia-smi`, then installs through either an `ubuntu22-cuda122` container environment or a CPU-only `ubuntu22` container environment. Docker installs always write the Linux runtime cache and store Docker bootstrap files in:

```text
~/.tokamak-zk-evm/linux/docker
```

When `--preprocess`, `--prove`, or `--verify` runs later, the CLI uses that bootstrap to execute the backend command inside Docker if the bootstrap exists and Docker is running. On Linux, if Docker is not running, the CLI falls back to the native runtime path. On Windows, Docker Desktop must be running because native Windows backend execution is not supported.

## What Does The Docker Install Image Include?

The npm package ships the Dockerfile used by `--install --docker`.
The host still needs only Node.js 20 or newer, the installed CLI package, Docker, and outbound HTTPS access.

Inside the Docker image, the CLI installs the build and runtime tools needed to compile the vendored backend and provision local resources:

- Ubuntu 22.04, or NVIDIA CUDA 12.2 on Ubuntu 22.04 when Docker CUDA probing succeeds
- Node.js and npm for running the packaged CLI and backend build scripts
- Rust and Cargo for building the backend binaries
- C/C++ build tooling, `cmake`, `pkg-config`, `clang`, and `libclang-dev` for native Rust dependencies
- `curl`, `git`, `tar`, `unzip`, and CA certificates for downloading, Git dependencies, and archive extraction

The image is intentionally conservative rather than aggressively minimal. Removing packages such as `clang`, `libclang-dev`, `pkg-config`, or `bash` requires a clean Docker build test of the backend before release.

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
~/.tokamak-zk-evm
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

`--doctor` checks whether the CLI can find the installed runtime for the current platform and prints the absolute runtime workspace path.

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
