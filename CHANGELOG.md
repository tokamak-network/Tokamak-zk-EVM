# Changelog

All notable changes to Tokamak zk-EVM are documented in this file.

The repository uses a synchronized release version for the CLI, subcircuit library, synthesizer packages, browser-compatible SNARK package, and backend Rust workspace. This root changelog is the only changelog source. npm package artifacts do not include changelog files; package READMEs link back to this root changelog.

The format is based on Keep a Changelog.

Release-entry dates are the dates on which version-bump pull requests are prepared offline and may differ from GitHub pull-request creation, merge, and npm publication dates.

## [3.0.1] - 2026-09-27

### Compatibility

- The subcircuit library retains the 3.0.0 circuit artifacts. Their CRS source
  digest is unchanged, so this patch continues to use the existing 3.0 CRS.

### Added

- MPC operators can verify a phase-2 contribution transcript independently
  before finalizing CRS. The command reads the recorded library version and
  does not create keys or publish artifacts.

### Fixed

- The CLI now recognizes the public Google Drive listing format during
  `--install`. Previously, a valid hexadecimal escape in the listing could
  prevent discovery of the CRS before installation began.

## [3.0.0] - 2026-09-23

### Protocol Changes

- The proof statement now separates transaction input, block context, static
  EVM input, committed log output, initial storage reads, and final storage
  writes. This replaces the former generic public-input and public-output
  boundary and makes each value's protocol role explicit.
- Transaction authorization now uses the signed channel transaction index as
  the public transaction identity instead of the Ethereum account nonce. The
  verified transaction origin, target contract, and function selector are
  bound to the EVM execution represented by the proof.
- Storage membership and root transitions are no longer proved inside the EVM
  circuit. The Tokamak zk-EVM proof exposes the first read and final committed
  write for each accessed storage location, while the surrounding bridge or
  orchestration protocol verifies the separate storage proof and binds the two
  proof statements together.
- Proof output now represents committed execution only. Logs from reverted
  child calls are excluded, and a reverted or exceptionally halted top-level
  transaction does not produce a synthesizable transaction proof.
- Supported contract calls must retain one fixed EVM execution and circuit
  topology throughout the application's accepted input and state domain. Use
  the
  [Synthesizer transaction-support guide](./packages/frontend/synthesizer/README.md#transaction-support)
  and its topology matrix before relying on a contract function.

### Compatibility and Migration

- Upgrade the CLI, subcircuit library, Node and Web Synthesizers,
  browser-compatible SNARK package, native backend, and CRS as one synchronized
  compatibility set. The `2.1.5` circuit artifacts, generated metadata, browser
  binaries, and CRS are not compatible with the 3.0.0 release line.
- Regenerate transaction snapshots with `tokamak-l2js` `0.2.0`, rebuild the
  subcircuit library artifacts, generate a matching CRS, and run
  `tokamak-cli --install` again after upgrading. Do not combine artifacts or
  packages from the two release lines.
- Integrations that read `instance.json` or describe public inputs must use the
  generated public-section and logical-interface metadata from this release.
  The former `bufferPubIn` and `bufferPubOut` positions are no longer valid.
- Node Synthesizer callers must replace the exported `CircuitGenerator` class
  or `createCircuitGenerator(synthesizer, wasmBuffers)` call with
  `await createCircuitGenerator(synthesizer)`. The factory no longer accepts
  WASM buffers and returns a `CircuitGenerationResult` containing placements
  and circuit artifacts directly.
- Native trusted setup now emits `tau_sequence.rkyv`, `prover_keys.rkyv`,
  `preprocess_keys.rkyv`, and `verifier_keys.rkyv` instead of one monolithic
  CRS archive. Prove combines the reusable tau sequence with prover-only keys;
  preprocess consumes its dedicated preprocess keys; and online verification
  uses verifier-only keys. The JSON CRS projection and monolithic browser CRS
  binaries are retired; browser integrations convert the four-file directory
  into the existing manifest-plus-chunk interface.

### High-Level Implementation Summary

#### Compatibility Improvements

- Producers now publish versioned logical-interface, public-section, binary
  artifact, and provenance contracts. Consumers validate those contracts and
  the synchronized package identities before synthesis, proving, or
  verification.
- Every package that consumes TokamakL2JS now uses exactly version `0.2.0`, and
  the signature circuit derives its private-message shape from that version's
  transaction specification.

#### Implementation Policy Maintenance

- Development builds consume local circuit output, while production builds
  consume the synchronized published library. Optimization settings do not
  change the selected artifact origin.
- Release and maintainer-side subcircuit-library builds require Circom `2.2.3`.
- Production CRS artifacts require canonical provenance and matching artifact
  hashes. Runtime and CRS updates are staged before activation so a failed
  update preserves the previous working generation.
- This repository maintains its publication-document candidates under explicit
  `publication` paths. Tonigma-docs independently decides which candidates to
  index; package READMEs remain package entry points.

#### Bug Fixes

- Corrected full-width arithmetic, shift, address, storage, and byte-sized
  memory behavior across the circuit library and Synthesizer.
- Corrected nested-call calldata ownership, dynamic memory views, committed-log
  rollback, storage read/write tracking, and failed top-level transaction
  handling.
- Corrected transaction-signature composition and canonical point handling so
  the verified identity and call target are routed consistently into EVM
  execution.

#### Validation Logic Strengthening

- Strengthened arithmetic, exponentiation, division, comparison, shift, and
  signature constraints and expanded composition-level topology checks.
- Native and browser runtimes now reject malformed or incompatible scalars,
  points, proofs, CRS data, generated metadata, and binary artifacts at their
  input boundaries.
- Release checks now validate packaged runtimes, dependency identities,
  producer contracts, CRS provenance, and representative native/browser proof
  interoperability before publication.

### Historical Pre-Normalized Circuit Snapshot

The values below are retained as a pre-normalized development snapshot; they
do not describe the current protocol. The current 3.0.0 library uses
`n = 1024`, `m = 2048`, `m_b = 512`, `t = 64`, and `s = 256`. Its active
domains are `n × s` for constraints and `m_b × s` for connections; the retired
aggregate interface-width and global-wire layout are not part of the current
protocol.

| Generated catalog metric | `2.1.5` | Pre-normalized candidate | Change |
| --- | ---: | ---: | ---: |
| Compiled and declared subcircuit types (`s_D`) | 14 | 44 | +30 (+214.3%) |
| Sum of constraints across one instance of every distinct type | 24,275 | 23,667 | -608 (-2.5%) |
| Sum of R1CS wires across one instance of every distinct type | 25,893 | 23,762 | -2,131 (-8.2%) |
| Largest single-subcircuit constraint count | 3,936 | 1,024 | -2,912 (-74.0%) |
| Maximum placements (`s_max`) | 256 | 256 | Unchanged |
| Setup constraint-domain parameter (`n`) | 4,096 | 1,024 | -3,072 (-75.0%) |
| Total generated matrix dimension (`m_D`) | 26,591 | 24,079 | -2,512 (-9.4%) |
| Total generated wire-domain boundary (`l_D`) | 4,824 | 1,420 | -3,404 (-70.6%) |
| Constraint grid size (`n × s_max`) | 1,048,576 | 262,144 | -786,432 (-75.0%) |

The public-wire boundaries and declared static buffer capacities changed as
follows. Capacities are physical field wires, not logical record counts.

| Boundary or capacity | `2.1.5` | Current | Change |
| --- | ---: | ---: | ---: |
| Free public-wire boundary (`l_free`) | 128 | 256 | +128 (+100.0%) |
| User-output boundary (`l_user_out`) | 65 | 130 | +65 (+100.0%) |
| User-input boundary (`l_user`) | 85 | 134 | +49 (+57.6%) |
| Final public boundary (`l`) | 728 | 396 | -332 (-45.6%) |
| Legacy public-output buffer capacity (`nPubOut`) | 65 wires | Removed | Removed |
| Legacy public-input buffer capacity (`nPubIn`) | 20 wires | Removed | Removed |
| Transaction input capacity (`nTxIn`) | Not separate | 4 wires | Added |
| Block input capacity | 24 wires | 24 wires | Unchanged |
| Fixed EVM input capacity (`nEVMIn`) | 600 wires | 140 wires | -460 (-76.7%) |
| Private input capacity (`nPrvIn`) | 1,060 wires | 50 wires | -1,010 (-95.3%) |
| Committed log capacity (`nLogOut`) | Not present | 50 wires | Added |
| Initial storage-read capacity (`nStorageLoad`) | Not present | 50 wires | Added |
| Final storage-write capacity (`nStorageStore`) | Not present | 30 wires | Added |

The pre-normalized candidate's named public buffers account for 298 non-padding wires within the
396-wire public boundary. The remaining 98 wires are free-boundary layout
padding. In `2.1.5`, the named public buffers accounted for 709 of 728 public
wires, leaving 19 padding wires.

Each storage record contains three 256-bit values—address, key, and value—and
therefore occupies six field wires. The 50-wire initial-read buffer supports
eight complete records plus two padding wires; the 30-wire final-write buffer
supports five complete records. The 50-wire log buffer holds at most 25
256-bit topic or data elements. A log uses a variable number of those elements,
so this is not a 25-log capacity.

The pre-normalized candidate's public sections end at `l_log_out = 50`,
`l_storage_store = 80`, `l_storage_load = 130`, `l_tx_in = 134`,
`l_block_in = 158`, and `l_evm_in = 396`. The current signature circuit uses
`nPrivateMessageInputs = 29`, `nPoseidonInputs = 2`, and a Poseidon batch size
of `nPoseidonBatch = 4`; the message-input count is obtained from the
synchronized TokamakL2JS specification. The former Merkle depth of 36
(`2^36` leaves), accumulation batch of 32, Jubjub exponentiation batch of 128,
and EVM exponentiation batch of 32 were removed rather than replaced by new
capacity parameters.

### Proof Generation Comparison

The private-state dapp's `transferNotes1To2` operation was used for the
release-line browser comparison. It transfers one private note into two output
notes. Timers cover `prove` only: installation, preprocessing, verification,
loading, and browser startup are excluded. Each reported browser proof was
accepted by its matching browser verifier; every current-candidate proof was
also accepted by the native release verifier.

| Execution path | Published `2.1.5` | Current 3.0 candidate | Absolute decrease | Decrease | Speedup |
| --- | ---: | ---: | ---: | ---: | ---: |
| Browser WASM, minified ES2022 bundle | 126.717 s | 18.812 s | 107.905 s | 85.2% | 6.74x |
| Native Rust, Cargo release profile | No verified 2.1.5 baseline | Not reported | — | — | — |

The browser rows are five-sample means on an Apple M4 Pro with Node 24.20.0,
npm 11.19.0, and Chromium 149.0.7827.55. The 2.1.5 row uses the immutable
published `@tokamak-zk-evm/snark-browser-compat@2.1.5` package. The current
candidate uses the same workload with its matching local development inputs
and CRS; it is performance evidence, not release-admission evidence.

A quantitative Rust comparison is intentionally omitted. Neither the exact
2.1.5 source revision nor its published CLI preserves an immutable Cargo lock
or release binary, so an unlocked rebuild would not identify the released
native dependency graph. The former comparison against a non-release branch
has been removed rather than presented as a 2.1.5 baseline.

The observed browser improvement is consistent with the documented reductions
in circuit size and interface boundaries. It does not assign every saved second
to an individual implementation change. Full samples, package identity,
input/CRS identities, method, and limitations are in the
[browser release-comparison evidence](./packages/backend/wasm/docs/optimization/evidence/3.0.0-browser-release-comparison.json).

### Subcircuit Library

- Rebuilt the generated catalog around the revised transaction, EVM, memory,
  log, and storage boundaries. The package now publishes the logical wire
  interfaces and buffer directions consumed by downstream packages.
- Removed in-circuit Merkle-tree membership and root-transition circuits,
  obsolete public-buffer layouts, and superseded operation and signature
  wrappers. Storage proof verification is now an external protocol
  responsibility.
- Pinned `tokamak-l2js` to `0.2.0` and regenerated the 44-type optimized
  catalog. Every generated type is at or below 1,024 constraints.

### Synthesizer Packages

- Node and Web now consume the library's published interfaces, buffer
  directions, and exact `tokamak-l2js` `0.2.0` transaction contract. They
  reject incompatible library artifacts before synthesis.
- Updated circuit generation for the revised transaction signature, EVM
  operations, memory views, committed logs, and public storage records.
- Removed the public `CircuitGenerator` class export. Use the one-argument
  `createCircuitGenerator()` factory and its direct `CircuitGenerationResult`
  as described in the migration section.
- Consolidated validation around maintained private-state topology scenarios
  and removed obsolete runtime, Merkle, duplicate-memory, and stale ERC20
  development paths.

### CLI

- The CLI now installs and runs only a backend runtime whose package, library,
  and compatibility identities match the installed CLI release line.
- Added `tokamak-cli --doctor` to check the installed runtime and report the
  identities of its `preprocess`, `prove`, and `verify` binaries.
- Native, Docker, CRS, preprocess, prove, and verify updates are staged before
  activation. A failed operation preserves the previous working runtime or
  output generation, and Linux can use the installed native fallback when its
  Docker runtime is unavailable.
- Improved backend diagnostics and recovery guidance while keeping
  machine-readable backend results internal to the CLI integration.
- Release checks now validate the packaged backend runtime and its contracts
  before the CLI is published.

### Native Backend and CRS Operations

- Backend builds now distinguish local development circuit output from the
  matching published production snapshot.
- Final CRS artifacts carry canonical provenance covering backend
  compatibility, library identity and origin, and final artifact hashes.
  Development setup output remains usable locally but is not accepted as a
  production CRS artifact.
- CRS generation, publication preparation, and activation use staged
  generations and preserve the previous active CRS on failure.
- Native preprocess, prove, and verify now reject malformed frontend scalars,
  points, and proof artifacts at their input boundary and return actionable
  workflow errors instead of continuing with invalid decoded data.

### Browser-Compatible SNARK

- Browser development builds use local library output; production builds use
  the synchronized published snapshot. Both require an explicit final CRS
  source and matching provenance during generation.
- `convertCrs()` now requires the matching canonical provenance document as its
  second argument and validates it before producing named prover, preprocess,
  and verifier CRS binaries.
- Browser converters and runtimes now use the producer-defined binary artifact
  contract for CRS, instance, witness, permutation, preprocess, and proof
  inputs. Malformed or mismatched binary artifacts are rejected before proving
  or verification.
- Release fixtures validate browser preprocessing against native output and
  verify both native-generated and browser-generated proofs with the matching
  CRS.

### Release and Documentation Policy

- Shared version and compatibility contracts now govern the CLI, subcircuit
  library, both Synthesizers, browser-compatible SNARK package, native backend,
  and CRS release inputs.
- Package release checks verify dependency versions, generated contract
  freshness, source boundaries, and required runtime artifacts.
- External technical publications now live under package-specific
  `publication` paths; package READMEs and documentation indexes point to the
  maintained locations.

## [2.1.5] - 2026-07-31

### Compatibility and Upgrade Notes

- Released the CLI, subcircuit library, synthesizer packages,
  browser-compatible SNARK package, and native backend as version `2.1.5`.
- This package-metadata patch does not change public APIs, input schemas,
  proving algorithms, verification semantics, or the binary format version.
  Existing `2.1` CRS artifacts remain compatible, so applications do not need
  a new trusted setup or CRS download.
- Existing `2.1.4` installations continue to work. Applications adopting
  `2.1.5` should upgrade the synchronized packages together.

### CLI

- Updated the npm package homepage and issue links to the active GitHub
  publication repository.

### Package Discovery and Support

- Applied the same homepage and issue-link update to the subcircuit library,
  Node and Web Synthesizers, and browser-compatible SNARK package.
- Added `JehyukJang` to every npm package's search metadata while retaining the
  existing Tokamak Network discovery terms.

## [2.1.4] - 2026-07-31

### Compatibility and Upgrade Notes

- Released the CLI, subcircuit library, synthesizer packages,
  browser-compatible SNARK package, and native backend as version `2.1.4`.
  Applications that use more than one Tokamak zk-EVM package should upgrade
  them together.
- Kept compatibility with the existing `2.1` backend CRS. This release does
  not require a new trusted setup or CRS download.
- Preserved the native proof inputs, proof format, and verification semantics.

### CLI

- Added `tokamak-cli --install --include-prerequisite` for users who want the
  CLI to detect and install missing native prerequisites on Ubuntu 20.04,
  Ubuntu 22.04, or macOS.
- The prerequisite flow shows the planned host changes and requires explicit
  confirmation before installation. It is unavailable with `--docker`.
- Fixed repeated macOS installations incorrectly reporting Homebrew-provided
  CMake or `pkg-config` as missing.
- Existing CLI commands and uninstall behavior are unchanged.

### Browser-Compatible SNARK (WASM Backend)

- `convertProverCrs()` has been replaced by `convertCrs()`. Update converter
  calls to read the returned `proverCrs`, `preprocessCrs`, and `verifierCrs`
  properties.
- `convertInstance()` now requires `a_pub_function` and includes it as a
  separate function-instance section. Regenerate instance binaries created
  with version `2.1.3` before using them with version `2.1.4`.
- `inspectBinary()` no longer accepts `includeSectionData` and no longer
  returns section contents as `dataHex`. Applications that need section bytes
  must retain the original binary and use the reported offsets and lengths.
- Added browser preprocessing with an independent installation lifecycle and
  explicit permutation, instance, and preprocess CRS inputs.
- Added complete Vite examples for preprocessing, proving, and verification,
  plus Webpack guidance for CRS conversion.
- Tuned the browser preprocessing default introduced in this release. On the
  Apple M4 Pro reference system, its three-run Chromium mean decreased from
  `11.017 s` to `10.942 s` (`0.7%` faster). Every measured output matched the
  native backend and passed browser verification. This result is a reference
  measurement, not a performance guarantee for other systems.

### Native Backend

- Five-run benchmarks measured the following end-to-end first-proof
  improvements from optimizations included in this release. Tests used an
  Apple M4 Pro CPU backend and an NVIDIA A10 CUDA backend:

  | Measured change | CPU mean | CUDA mean |
  | --- | ---: | ---: |
  | Reduced final proof construction work | `39.998 s` → `38.332 s` (`4.2%` faster) | `23.878 s` → `23.683 s` (`0.8%` faster) |
  | Removed a repeated proof calculation | `38.465 s` → `37.157 s` (`3.4%` faster) | `24.760 s` → `23.758 s` (`4.0%` faster) |
  | Shared work across related evaluations | `37.805 s` → `37.123 s` (`1.8%` faster) | `23.944 s` → `23.778 s` (`0.7%` faster) |
  | Reused decoded CRS data during the first proof | `37.869 s` → `37.147 s` (`1.9%` faster) | `24.920 s` → `23.914 s` (`4.0%` faster) |

- These separately measured improvements are not additive. All measured paths
  used the same release fixture and preserved the supported proof protocol,
  proof output, and verifier behavior.

## [2.1.3] - 2026-07-27

### Repository

- Synchronized the release version to `2.1.3` across the CLI, subcircuit library, synthesizer packages, browser-compatible SNARK package, and backend workspace.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.1.3` and updated its `@tokamak-zk-evm/synthesizer-node` dependency to `^2.1.3`.
- Kept `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion` at `2.1`.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.1.3`.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.1.3`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.1.3` dependency range.

### Browser-Compatible SNARK

- Added the initial `@tokamak-zk-evm/snark-browser-compat` package for bundler-based browser proof generation, verification, and artifact conversion.
- Added explicit prover and verifier installation lifecycles, named binary inputs, staged proving progress, browser examples, package-boundary checks, and publication documentation.
- Kept the package outside the root npm workspace so release builds resolve the synchronized `@tokamak-zk-evm/subcircuit-library` version from npm.
- Added release CI that builds the package only from a provenance-verified verifier CRS and skips automated publication until the package has been bootstrapped manually on npm.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.1.3`.
- Added a typed polynomial expression evaluator with coefficient-domain and fused evaluation-domain execution, and applied the fused path to the prover's `prove2.p_comb` expression.
- Added focused correctness coverage, prover operation diagnostics, and timing benchmarks for fused polynomial expression candidates.
- Stabilized backend library tests by serializing test execution and making NTT domain initialization reusable.
- Updated stale VS Code launch arguments and ignored backend-local temporary planning files.

## [2.1.2] - 2026-07-18

### Repository

- Synchronized the release version to `2.1.2` across the CLI, subcircuit library, synthesizer packages, and backend workspace.
- Kept synchronized version management scoped to source package manifests instead of generated qap-compiler dist metadata.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.1.2`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.1.2` dependency range.
- Kept `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion` at `2.1`.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.1.2`.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.1.2`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.1.2` dependency range.
- Added primary-only default output selection with explicit supplementary output selection for Node and Web adapters.
- Added the Node `--output-supplement` flag and Web `{ outputSupplement: true }` output option.
- Moved supplementary outputs to logical `supplement/*` artifact paths and added `supplement/placements.json`.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.1.2`.

## [2.1.1] - 2026-07-11

### Repository

- Synchronized the release version to `2.1.1` across the CLI, subcircuit library, synthesizer packages, and backend workspace.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.1.1`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.1.1` dependency range.
- Kept `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion` at `2.1`.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.1.1`.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.1.1`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.1.1` dependency range.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.1.1`.
- Optimized verifier Lagrange K0 evaluation by using the direct basis-polynomial formula instead of reconstructing coefficients through NTT.
- Kept final CRS artifacts limited to `combined_sigma.rkyv`, `sigma_preprocess.rkyv`, `sigma_verify.json`, and MPC provenance, excluding the unreleased `combined_sigma.json` artifact from setup outputs and upload archives.

## [2.1.0] - 2026-05-02

### Repository

- Synchronized the release version to `2.1.0` across the CLI, subcircuit library, synthesizer packages, and backend workspace.
- Updated `npm run version:sync` to also derive and write the CLI-compatible backend version from the synchronized `MAJOR.MINOR` release line.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.1.0`.
- Updated `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion` to `2.1`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.1.0` dependency range.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.1.0`.
- Updated `tokamak-l2js` consumption to `0.1.4` and regenerated qap-compiler constants so `nMtDepth()` is `36`.
- Updated `qap-compiler --reload-constants` to verify the local `tokamak-l2js` install against the npm registry latest version before syncing constants.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.1.0`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.1.0` dependency range.
- Updated both synthesizer packages to consume `tokamak-l2js` through the `^0.1.4` dependency range.
- Refreshed private-state example fixtures with the current deployment contract addresses, bytecode, and transaction signatures.
- Regenerated the L2StateChannel and private-state example state roots for the `MT_DEPTH=36` configuration.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.1.0`.
- Moved the proving compatibility line to `2.1` for the `MT_DEPTH=36` subcircuit configuration.

## [2.0.16] - 2026-05-01

### Repository

- Synchronized the release version to `2.0.16` across the CLI, subcircuit library, synthesizer packages, and backend workspace.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.16`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.16` dependency range.
- Bundled the updated `2.0.16` backend runtime used by `--install`, `--preprocess`, `--prove`, and `--verify`; CLI command behavior is otherwise unchanged.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.0.16`.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.16`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.16` dependency range.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.16`.
- Pruned unused embedded subcircuit-library build-support metadata and compatibility helpers while keeping release backend subcircuit snapshots internal to the backend build.
- Switched setup and prove R1CS loading from generated JSON constraint files to binary `.r1cs` artifacts, including binary header validation and sparse row scanning.
- Optimized prove initialization by using sparse uvwXY generation, binary R1CS preload, and cached permutation power tables.
- Optimized prover polynomial work with coefficient-domain vanishing division, algebraic polynomial-combination rewrites, cached cross-stage terms, and special-form polynomial products.
- Optimized bivariate NTTs by using ICICLE column-batch transforms for real 2D shapes and direct 1D fast paths for single-axis shapes.
- Removed generic polynomial multiplication output shrinking after interpolation to avoid repeated size-optimization overhead.
- Fixed the `prove0` `B` zero-knowledge vanishing term to use the private-input domain exponent `l_D - l`.
- Expanded backend timing instrumentation and refreshed CUDA prove optimization reports and artifacts.

## [2.0.15] - 2026-04-30

### Repository

- Synchronized the release version to `2.0.15` across the CLI, subcircuit library, synthesizer packages, and backend workspace.
- Removed package-local changelog mirrors from npm package artifacts and linked package READMEs to the root changelog instead.
- Added the Tokamak zk-EVM version management rules and CRS compatibility check policy to `docs/version-rules.md`.
- Clarified that, within a fixed `MAJOR.MINOR` compatibility line, CRS reuse across patch releases is gated by subcircuit `sourceDigest` equality.
- Removed obsolete repository-local documentation files that are no longer part of the release documentation set.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.15`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.15` dependency range.
- Added `tokamakZkEvm.compatibleBackendVersion` as the CLI-owned backend compatibility version source of truth.
- Changed CRS install selection to use strict `MAJOR.MINOR` CRS archive names and reject patch-versioned CRS archives.
- Added CRS provenance, CRS artifact hash, backend metadata, and subcircuit source digest validation before installing downloaded CRS artifacts.
- Kept installed runtime state scoped to the installed package version and derived the CRS compatibility version from that package version.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.0.15`.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.15`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.15` dependency range.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.15`.
- Recorded the CLI-compatible backend version in backend build metadata.
- Recorded subcircuit-library source digests in backend build metadata for CRS compatibility checks.
- Restricted the subcircuit source digest to CRS-relevant constants, r1cs, wasm, json, and library configuration artifacts.
- Simplified subcircuit snapshot metadata by deriving the constants path from the unpacked snapshot layout instead of storing it separately.
- Changed dusk-backed MPC setup provenance and CRS archive naming to use the `MAJOR.MINOR` compatibility version.
- Added pre-publication validation that rejects CRS provenance or build metadata that does not match the CLI-compatible backend version.

### CI

- Moved source build validation to the front of the publish workflow.
- Changed the publish workflow to build release tarballs once in `source-build`, pass those tarballs through EVM compatibility, CRS, and pre-publish checks, and publish the same tested tarballs to npm.
- Moved EVM compatibility tests before subcircuit-library publishing so package-level smoke tests run before any npm publication.
- Kept `pre-publish-test-build` after subcircuit-library publishing so backend release builds can continue resolving `@tokamak-zk-evm/subcircuit-library@latest` from npm.
- Updated the published CRS check to select only the latest strict `MAJOR.MINOR` CRS archive and validate its embedded provenance, metadata, and hashes.

## [2.0.14] - 2026-04-29

### Repository

- Synchronized the release version to `2.0.14` across the CLI, subcircuit library, synthesizer packages, and backend workspace.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.14`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.14` dependency range.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.0.14`.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.14`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.14` dependency range.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.14`.
- Limited local qap-compiler subcircuit builds to `mpc-setup`; release builds of `trusted-setup`, `preprocess`, `prove`, and `verify` continue to resolve `@tokamak-zk-evm/subcircuit-library` from npm.

## [2.0.13] - 2026-04-29

### Repository

- Synchronized the release version to `2.0.13` across the CLI, subcircuit library, synthesizer packages, and backend workspace.

### Subcircuit Library

- Required the official system `circom` compiler for subcircuit builds instead of falling back to the bundled `circom2` package.
- Removed the `circom2` package dependency from the subcircuit library build toolchain.
- Recorded the system `circom` compiler metadata in the generated subcircuit library build metadata.
- Updated the release publish workflow to install and verify `circom 2.2.2` before building the subcircuit library.
- Switched the subcircuit library publish workflow dependency installation from `npm install` to `npm ci`.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.13`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.13` dependency range.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.13`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.13` dependency range.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.13`.

## [2.0.12] - 2026-04-29

### Repository

- Introduced root-level version synchronization tooling for the release packages and backend workspace.
- Centralized changelog maintenance in this root `CHANGELOG.md`.
- Synchronized the release version to `2.0.12` across the CLI, subcircuit library, synthesizer packages, and backend workspace.

### CLI

- Bumped `@tokamak-zk-evm/cli` to `2.0.12`.
- Updated the CLI package to consume `@tokamak-zk-evm/synthesizer-node` through the synchronized `^2.0.12` dependency range.
- Switched CLI release readiness checks to validate this root changelog.

### Subcircuit Library

- Bumped `@tokamak-zk-evm/subcircuit-library` to `2.0.12`.
- Switched dist package generation to copy this root changelog into the published package artifact.

### Synthesizer

- Bumped `@tokamak-zk-evm/synthesizer-node` and `@tokamak-zk-evm/synthesizer-web` to `2.0.12`.
- Updated both synthesizer packages to consume `@tokamak-zk-evm/subcircuit-library` through the synchronized `^2.0.12` dependency range.
- Switched package changelog mirroring and release validation to use this root changelog.

### Backend Workspace

- Bumped the backend Rust workspace version to `2.0.12`.

## [2.0.11] - 2026-04-28

### CLI

- Fixed `--doctor` argument validation, reduced duplicate CLI stage file lists, and removed the undocumented `tokamak-zk-evm` binary alias in favor of `tokamak-cli`.

## [2.0.10] - 2026-04-27

### CLI

- Allowed `--install --docker` on Windows hosts with Docker Desktop by using the Linux Docker runtime cache for Docker installs and backend commands.
- Included the ICICLE manifest in Docker install images and added a Dockerfile guard for that file.
- Fixed Windows Docker-mode uninstall to remove the Linux Docker runtime cache instead of failing native platform detection.
- Removed host `zip` and `unzip` command dependencies from stage input archives and proof bundle export.
- Fixed `--verbose` parsing for preprocess, prove, verify, and proof export commands.
- Hardened CUDA Docker mode by checking driver compatibility, forcing the selected CUDA ICICLE asset during Docker installs, validating bootstrap consistency, and falling back to non-GPU Docker runs when CUDA is no longer available.
- Added Docker image existence checks for saved bootstraps, CUDA fallback handling to the generated Docker run script, and Windows-specific doctor install guidance.

## [2.0.9] - 2026-04-26

### CLI

- Removed the npm `postinstall` hook so installing the package no longer runs `tokamak-cli --install` automatically.

## [2.0.8] - 2026-04-26

### CLI

- Added `--doctor` output for the absolute runtime workspace path.

## [2.0.7] - 2026-04-24

### CLI

- Simplified internal CLI stage and backend build orchestration with no intended user-facing behavior changes.

## [2.0.6] - 2026-04-24

### CLI

- Switched CRS download length detection to use the published Google Drive folder listing metadata instead of issuing a direct-download HEAD request before resumable downloads.

## [2.0.5] - 2026-04-24

### CLI

- Simplified CRS archive cache reuse so the CLI now compares the published archive version, timestamp, and file size instead of unpacking cached archives to verify provenance hashes.

## [2.0.4] - 2026-04-24

### CLI

- Added Linux-only `--install --docker` support that installs through an Ubuntu 22 Docker image, records Docker bootstrap files under `~/.tokamak-zk-evm/linux/docker`, and runs backend preprocess, prove, and verify commands through that bootstrap when Docker is available.
- Moved Docker install image construction to a static Dockerfile that is shipped in the npm package.
- Documented the Docker install image contents and the rationale for its conservative dependency set.
- Reworked install caches so CRS reuse is validated with `crs_provenance.json` version and SHA-256 artifact hashes, and ICICLE tarball reuse is validated with packaged SHA-256 manifests.

## [2.0.3] - 2026-04-22

### CLI

- Switched the default CLI workspace root to `~/.tokamak-zk-evm` so the runtime now uses the existing top-level Tokamak workspace directly.

## [2.0.2] - 2026-04-22

### CLI

- Avoided duplicate CLI publish attempts in the GitHub Actions release workflow while keeping `npm run publish` available for maintainers.
- Aligned CLI setup artifact handling with the current CRS package format by expecting `sigma_verify.json` during install and verification.

## [2.0.1] - 2026-04-22

### CLI

- Added `--uninstall` so the CLI can remove its local workspace and cached runtime files for the current platform.
- Changed the default CLI workspace root from `~/.tokamak-zk-evm/cli` to `~/.tokamak-zk-evm`.
- Changed Linux runtime installation to download the ICICLE CUDA backend only when an NVIDIA GPU is detected.

## [2.0.0] - 2026-04-21

### CLI

- Removed the dependency on the repository root `tokamak-cli` wrapper and root shell packaging scripts.
- Moved runtime installation into the CLI package itself.
- Added resumable CRS downloads with progress output.
- Flattened proof bundle export so `--extract-proof` output can be passed back into `--verify`.
- Clarified working-directory behavior and runtime output locations in the package documentation.

## [1.0.3] - 2026-04-20

### Subcircuit Library

- Added published build metadata for the subcircuit library package.
- Aligned the published build metadata schema with the synthesizer package format.
- Included `build-metadata.json` with the `tokamak-l2js` build version and declared dependency range in the published package.

## [1.0.2] - 2026-04-28

### Backend Workspace

- Added memory-aware tiled GPU matrix multiplication for the R1CS-to-QAP evaluation path.
- Added retry handling that halves the GPU matrix multiplication tile width after allocation failures.
- Added environment overrides for GPU matrix multiplication tile width and memory budget selection.
- Added a tiled matrix multiplication regression test against the existing untiled implementation.
- Bumped the backend workspace version from `1.0.1` to `1.0.2`.
- Changed `read_R1CS_gen_uvwXY` to use the tiled GPU matrix multiplication path while keeping the CPU path unchanged.

### Synthesizer

- Updated the published `@tokamak-zk-evm/subcircuit-library` dependency range to `^1.0.3`.

### Subcircuit Library

- Repositioned the package as the consumer-facing Tokamak zk-EVM subcircuit library.
- Unified the GitHub and npm README around a single consumer-facing document.
- Clarified the published artifact surface, consumer compatibility, and package role.
- Excluded `info` build logs from the published `dist` package.

## [1.0.1] - 2026-04-22

### Backend Workspace

- Added release-time embedding of the latest published `@tokamak-zk-evm/subcircuit-library` snapshot for backend release binaries.
- Added per-package `build-metadata-<package>.json` generation for backend release builds.
- Added CRS publication hardening for `dusk_backed_mpc_setup`, including release-only publication checks, build-metadata validation, duplicate-version rejection, and Drive publication metadata.
- Added Google Drive archive publication support for dusk-backed CRS outputs, including public viewer sharing configuration and publication metadata capture.
- Bumped the backend workspace version from `1.0.0` to `1.0.1`.
- Switched release CLI contracts to use embedded subcircuit library assets instead of runtime `--subcircuit-library` paths.
- Shared final CRS artifact generation between `trusted-setup` and `mpc-setup`.
- Changed the verification artifact format from `sigma_verify.rkyv` to `sigma_verify.json`.
- Updated backend packaging and debug launch configurations to include release build metadata and match the embedded release input model.
- Refreshed backend documentation to match the current release and publication flow.
- Removed legacy and duplicate `mpc-setup` utilities, compatibility paths, and deprecated helper binaries that were no longer part of the wrapper-first flow.

### Synthesizer

- Removed the extra `ethers` installation requirement from the published package docs and metadata.

### Subcircuit Library

- Bumped the published package to `1.0.1`.
- Finalized the rename from `qap-compiler` to `subcircuit-library` for the published package.
- Introduced trusted publishing and streamlined `dist`-based release preparation.

## [1.0.0] - 2026-04-20

### Synthesizer

- Established the published Node CLI surface for file-based Tokamak zk-EVM synthesis runs.
- Established the published browser-facing package with bundled subcircuit-library assets.
- Established the shared synthesis runtime that both published packages consume.

### Subcircuit Library

- Reworked the package around a generated `dist` publish flow.
- Promoted the package version to `1.0.0`.
- Established the published subcircuit library package as a dedicated npm delivery surface.
- Added the CLI build toolkit flow and initial publish automation groundwork.
