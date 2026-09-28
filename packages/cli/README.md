# `@tokamak-zk-evm/cli`

The supported command-line entry point for installing the native Tokamak
zk-EVM runtime and running synthesis, preprocessing, proving, verification, and
proof export.

## Install and run

First prepare a directory containing the
[four synthesis input files](#synthesis-inputs). The
[`transferNotes1To2` example](../frontend/synthesizer/examples/privateState/transferNotes/transferNotes1To2)
shows the expected layout and values. Clone or download that example from this
repository before using it: it is not installed with the npm CLI package. You
can instead provide your own directory with the same four inputs.

The quick start below assumes that the
[native requirements](#native-requirements) are already installed and
downloads the compatible CRS. Use
[`--include-prerequisite`](#automatic-prerequisite-installation) for a guided
macOS or Ubuntu setup, or `--docker` on another Linux distribution or Windows.

```bash
npm install -g @tokamak-zk-evm/cli
tokamak-cli --install
tokamak-cli --synthesize ./transferNotes1To2
tokamak-cli --preprocess
tokamak-cli --prove
tokamak-cli --verify
```

The npm package installs the launcher and compatible source. `--install`
builds the native Rust backend on the target machine; there is no separate
backend npm package.

## Installation modes

| Command                                        | Use                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `tokamak-cli --install`                        | Build with prerequisites already installed and download compatible CRS artifacts |
| `tokamak-cli --install --include-prerequisite` | Offer to install missing prerequisites on macOS or supported Ubuntu releases     |
| `tokamak-cli --install --docker`               | Build and run in the packaged Linux container workflow                           |
| `tokamak-cli --install --no-full-setup` | Embed verifier keys; skip prover, preprocess and tau downloads |

Every installation downloads CRS provenance and `verifier_keys.rkyv` before
compiling the release-optimized verifier. `--no-full-setup` still requires
Google Drive access. It omits the data needed to generate proofs and preprocess;
the native verifier accepts externally supplied proof, public input and
preprocess without reading CRS files at runtime. The retired `--no-setup`
option is not accepted.

The Drive root contains one folder named by each compatible backend version
(`MAJOR.MINOR`), holding `prover_keys.rkyv`, `preprocess_keys.rkyv`,
`verifier_keys.rkyv` and `crs_provenance.json`. Its separate `tau_sequence`
folder holds `<SHA-256>.rkyv` files. Full installation selects the tau digest
recorded in the version's provenance and installs it as `tau_sequence.rkyv`.
ZIP-based CRS releases are not supported. These files must be published in
the new layout before production installation can be qualified.

### Native requirements

Node.js 20 or newer and npm are bootstrap requirements. The CLI does not
install either of them. Every native `--install` then checks the following
managed prerequisite policy; `--include-prerequisite` uses the same policy to
offer installation of missing or incompatible tools.

| Managed requirement | macOS | Ubuntu 20.04 / 22.04 |
| --- | --- | --- |
| Rust | `rustc` 1.85 or newer | `rustc` 1.85 or newer |
| Cargo | `cargo` 1.85 or newer | `cargo` 1.85 or newer |
| CMake | 3.18 or newer | 3.18 or newer |
| C/C++ toolchain | `cc`, `c++`, `install_name_tool` | `cc`, `c++`, `make` |
| LLVM toolchain | Not required | `clang`, `lldb`, `ld.lld` |
| Git | Not required | `git` |
| Ninja | Not required | `ninja` |
| pkg-config | `pkg-config` | `pkg-config` |
| tar | `tar` | `tar` |
| unzip | Not required for CRS installation | Not required for CRS installation |

Native installation also requires outbound HTTPS to npm, crates.io, GitHub,
GitHub Releases, and Google Drive.

Native targets are macOS, Ubuntu 20.04, and Ubuntu 22.04. Other Linux
distributions should use Docker. Native Windows is unsupported; use WSL2 or
Docker Desktop.

Example host preparation:

```bash
# macOS: install prerequisites yourself
xcode-select --install
brew install node cmake pkg-config
curl https://sh.rustup.rs -sSf | sh

# Ubuntu 20.04 or 22.04: let the CLI propose missing prerequisites
npm install -g @tokamak-zk-evm/cli
tokamak-cli --install --include-prerequisite
```

Docker hosts need Node.js 20+, the CLI package, Docker, and a running daemon.
CUDA mode requires a successful CUDA 12.2 container probe, an NVIDIA GPU, and
driver `525.60.13` or newer.

### Automatic prerequisite installation

`--include-prerequisite` requires a TTY, prints the complete change plan, and
continues only after an explicit `y` or `yes`.

| Scope                 | Behavior                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Ubuntu                | Uses targeted APT/LLVM commands and, on 20.04 when needed, a checksum-verified CMake 3.27.4 source archive |
| macOS                 | Uses Xcode Command Line Tools and Homebrew                                                                 |
| Rust                  | Uses the official rustup installer when missing or incompatible                                            |
| Never installed       | Node.js, npm, Docker, GPU drivers, and network configuration                                               |
| Privileged operations | Requests elevation only for the individual operation; do not run the complete CLI as root                  |
| Uninstall             | Removes only the CLI runtime, not system packages, Xcode tools, Rust, Homebrew, or source-installed CMake  |

Review external installer terms and organizational policy before approval. If
an installer fails, resolve its error and rerun the command; prerequisite
detection resumes without masking the failure.

### What `--install` creates

The installer:

- builds the native backend;
- downloads ICICLE runtime archives and verifies their packaged SHA-256
  digests;
- downloads the compatible CRS artifacts unless setup is skipped, validating version,
  provenance, and artifact hashes; and
- stores runtime resources under the CLI cache.

Runtime mode is selected only by
`~/.tokamak-zk-evm/<platform>/installation.json`. A Docker installation also
stores its subordinate launch descriptor in
`~/.tokamak-zk-evm/linux/docker/bootstrap.json`; the CLI validates that the
descriptor's package version, Docker environment, and image name match the
selected installation before invoking Docker. A residual descriptor cannot
switch a native installation to Docker. After a valid Docker selection, Linux
falls back to the installed native Linux runtime only when the Docker daemon is
unavailable. Windows requires Docker Desktop because native backend execution
is unsupported.

### Runtime upgrades and ownership

The cached runtime is valid only for the exact installed CLI package version.
After upgrading or reinstalling `@tokamak-zk-evm/cli`, run `tokamak-cli
--install` before running synthesis or backend commands. On Windows, use
`tokamak-cli --install --docker` instead. The CLI does not reuse a runtime
from a different package version.

The installer manages CRS generations below its runtime cache and activates one
generation through its own `setup/output` symbolic link. Do not replace that
link with a path owned by another tool; the installer rejects an unmanaged
active CRS link rather than replacing it.

## Commands

| Command                     | Input                                         | Result                                                |
| --------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `--install`                 | Installation options                          | Prepared local runtime                                |
| `--synthesize <DIR>`        | Four transaction replay JSON files                      | Placement selector, placement, instance, permutation, and state artifacts |
| `--preprocess [DIR_OR_ZIP]` | Matching selector, permutation, and instance            | Verifier preprocessing commitments                              |
| `--prove [DIR_OR_ZIP]`      | Matching selector, placement, permutation, and instance | Proof                                                           |
| `--verify [DIR_OR_ZIP]`     | Matching proof, preprocess, and instance      | Verification result                                   |
| `--extract-proof <ZIP>`     | Completed cached workflow                     | Portable proof bundle                                 |
| `--doctor`                  | Installed runtime                             | Runtime path and installation status                  |
| `--uninstall`               | CLI cache                                     | Removes the CLI-owned runtime                         |

Relative paths are resolved from the current working directory.

## Synthesis inputs

`--synthesize <DIR>` expects these four files at the directory root:

| File                           | Role                                                                      | Format and owner                                                                                                          | How to obtain it                                                     | Example                                                                              |
| ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `previous_state_snapshot.json` | State immediately before execution, including storage reconstruction data | [`tokamak-l2js` `StateSnapshot`](https://github.com/tokamak-network/TokamakL2JS/blob/main/src/interface/channel/types.ts) | Call `TokamakL2StateManager.captureStateSnapshot()` before execution | [File](../frontend/synthesizer/examples/privateState/transferNotes/transferNotes1To2/previous_state_snapshot.json) |
| `transaction.json`             | Signed Tokamak L2 transaction to replay                                   | [`tokamak-l2js` `TxSnapshot`](https://github.com/tokamak-network/TokamakL2JS/blob/main/src/interface/channel/types.ts)    | Call `TokamakL2Tx.captureTxSnapshot()`                               | [File](../frontend/synthesizer/examples/privateState/transferNotes/transferNotes1To2/transaction.json)             |
| `block_info.json`              | Block-opcode and execution-environment values                             | Synthesizer `BlockInfo` JSON                                                                                              | Normalize the trusted application or L2 RPC block context            | [File](../frontend/synthesizer/examples/privateState/transferNotes/transferNotes1To2/block_info.json)              |
| `contract_codes.json`          | Deployed bytecode reached by the supported call flow                      | Synthesizer `ContractCodeEntry[]` JSON                                                                                    | Export deployment/state data or query the trusted state source       | [File](../frontend/synthesizer/examples/privateState/transferNotes/transferNotes1To2/contract_codes.json)          |

`StateSnapshot` contains `stateRoots`, `storageAddresses`, `storageKeys`,
`storageTrieRoots`, `storageTrieDb`, and `channelId`. Its address-indexed arrays
must remain aligned. Storage-slot keys and trie database keys are not
interchangeable.

`TxSnapshot` contains `channelTransactionIndex`, `to`, hex calldata in `data`,
`senderPubKey`, and optional signature strings `v`, `r`, and `s`. The index is
the first signature-bound transaction word; it is not an Ethereum account nonce.

`block_info.json` contains `0x`-prefixed `coinBase`, `timeStamp`,
`blockNumber`, `prevRanDao`, `gasLimit`, `chainId`, `selfBalance`, and
`baseFee` values plus `prevBlockHashes`.

`contract_codes.json` is an address/bytecode array:

```json
[
  {
    "address": "0x...",
    "code": "0x..."
  }
]
```

Use the `StateSnapshot` and `TxSnapshot` exports from the compatible
`tokamak-l2js` package rather than recreating them. All four files must
describe one coherent pre-transaction state and block context.

```bash
# Conventional directory
tokamak-cli --synthesize ./transferNotes1To2

# Explicit files
tokamak-cli --synthesize \
  --previous-state ./inputs/previous_state_snapshot.json \
  --transaction ./inputs/transaction.json \
  --block-info ./inputs/block_info.json \
  --contract-code ./inputs/contract_codes.json
```

## Backend inputs

Without an argument, backend commands use the preceding outputs in the runtime
cache. A supplied directory or ZIP contains only transaction-specific files;
the compatible CRS remains in the installed cache.

| Command        | External input                       | Role and acquisition                                         |
| -------------- | ------------------------------------ | ------------------------------------------------------------ |
| `--preprocess` | `selector.json`                      | Synthesizer placement selector                               |
| `--preprocess` | `permutation.json`                   | Synthesizer wire-equality cycles                             |
| `--preprocess` | `instance.json`                      | Public and function-instance values from the same synthesis  |
| `--prove`      | `selector.json`                      | Matching Synthesizer placement selector                      |
| `--prove`      | `placementVariables.json`            | Placement IDs, offsets, and witnesses from synthesis         |
| `--prove`      | `permutation.json`                   | Matching Synthesizer permutation                             |
| `--prove`      | `instance.json`                      | Matching Synthesizer instance                                |
| `--verify`     | `univariate_proof.bin`               | Binary proof emitted by the matching prove run               |
| `--verify`     | `univariate_verifier_preprocess.bin` | Binary preprocess emitted by the matching preprocess run     |
| `--verify`     | `instance.json`                      | Instance asserted by the proof                               |

Installed setup files are:

| Cache file             | Used by    | Format                                                   |
| ---------------------- | ---------- | -------------------------------------------------------- |
| `tau_sequence.rkyv`    | Prove      | Trusted setup tau sequence                              |
| `prover_keys.rkyv`     | Prove      | Opaque versioned Rust prover keys                       |
| `preprocess_keys.rkyv` | Preprocess | Opaque versioned Rust preprocess keys                   |
| `verifier_keys.rkyv`   | Install    | Opaque versioned Rust verifier keys compiled into verify |
| `crs_provenance.json`  | Setup      | Compatible CRS identity and artifact digest record       |

Do not place setup files in an external transaction directory. Do not mix
files from different synthesis runs or incompatible releases.

```text
preprocess-input/       prove-input/                         verify-input/
├── selector.json       ├── selector.json                    ├── instance.json
├── instance.json       ├── instance.json                    ├── univariate_proof.bin
└── permutation.json    ├── permutation.json                 └── univariate_verifier_preprocess.bin
                        └── placementVariables.json
```

```bash
tokamak-cli --preprocess ./artifacts
tokamak-cli --prove ./artifacts.zip
tokamak-cli --verify ./proof-bundle.zip
```

## Outputs and cache

The default cache root is `~/.tokamak-zk-evm`; override it with
`TOKAMAK_ZKEVM_CLI_CACHE_DIR`.

```text
<cache>/<platform>/runtime/resource/
├── setup/output
├── synthesizer/output
├── preprocess/output
└── prove/output
```

Synthesis writes `placementVariables.json`, `selector.json`, `instance.json`,
`instance_description.json`, `permutation.json`, and `state_snapshot.json`.
Preprocess writes `univariate_verifier_preprocess.bin`; prove writes
`univariate_proof.bin`.
`--synthesize` clears its previous output directory before writing.

`--extract-proof <OUTPUT_ZIP_PATH>` writes to the requested path and includes:

- `univariate_proof.bin`
- `univariate_verifier_preprocess.bin`
- `instance.json`

```bash
tokamak-cli --extract-proof ./proof-bundle.zip
tokamak-cli --verify ./proof-bundle.zip
```

`--doctor` prints the absolute runtime path and verifies that the current CLI
package version has a valid installed runtime for the current platform.

## npm publication

| Item              | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| Package           | [`@tokamak-zk-evm/cli`](https://www.npmjs.com/package/@tokamak-zk-evm/cli) |
| Published version | `npm view @tokamak-zk-evm/cli version`                                     |
| Distribution      | npm launcher plus locally built native backend                             |
| Release notes     | [Repository `CHANGELOG.md`](../../CHANGELOG.md)                            |

## Security and operational responsibilities

Authenticate external directories, ZIP files, CRS artifacts, and their release
compatibility. Keep RPC credentials, signing keys, and wallet secrets out of
inputs, command history, proof bundles, and source control. Snapshots,
witnesses, logs, proofs, and cache contents may contain sensitive application
data.

Installation can invoke package managers, container tools, and network
services. Proof operations can consume substantial CPU, GPU, memory, disk, and
time. Apply appropriate authorization, resource limits, isolation, and
monitoring. Successful proving or verification does not establish the
security of the application, circuit library, setup, or surrounding protocol.

## Project and license

- [Source](https://github.com/JehyukJang/Tokamak-zk-EVM/tree/main/packages/cli)
- [Issues](https://github.com/JehyukJang/Tokamak-zk-EVM/issues)
- [Native backend](../backend/README.md)

Dual-licensed under `MIT OR Apache-2.0`. Dependencies retain their own
licenses.
