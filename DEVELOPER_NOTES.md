# Developer Notes

This document is for application developers and service operators who understand ordinary Solidity
and blockchain deployment workflows but are not expected to be zero-knowledge proof specialists.
The main point is that Tokamak zk-EVM application support is governed by two coupled artifacts:

- the generated subcircuit library from `packages/frontend/qap-compiler`
- the CRS generated from that exact subcircuit library by the backend setup flow

Treat these as a matched pair. If the subcircuit library changes, the old CRS is no longer the CRS
for the new circuit shape.

## Application onboarding workflow

For a new application, start from the application itself rather than from circuit parameters:

1. Define the application behavior and implement the contract in Solidity.
2. Compile the contract and collect the bytecode needed by the Tokamak L2 transaction replay input.
3. Build a representative transaction snapshot for the application flow.
4. Run the Synthesizer against that snapshot.
5. If synthesis succeeds, keep the current subcircuit library and CRS.
6. If synthesis fails because the current library capacity is too small, tune the qap-compiler
   parameters, regenerate the subcircuit library, and run the same Synthesizer test again.

Capacity tuning only addresses capacity errors. It does not make unsupported EVM semantics
supported. If the application uses unsupported opcodes, unsupported contract-creation paths,
unsupported precompiles, or runtime behavior outside the Tokamak L2 execution model, increasing
buffers or `s_max` is the wrong fix.

## qap-compiler capacity parameters

The Synthesizer currently reports the two capacity failures that usually matter during application
onboarding:

- `Error: Synthesizer: Insufficient <buffer> length. Ask the qap-compiler for a longer buffer
  (required length: N).`
- `Error: Synthesizer: Insufficient s_max. Ask the qap-compiler for increasing s_max
  (required s_max: N).`

Use the reported `required length` or `required s_max` as the lower bound for the next trial. Do
not blindly raise every value. Larger values make more applications fit, but they also increase the
circuit shape, CRS size, memory pressure, and proof generation time.

The main settings are:

| Need | File | Setting |
| --- | --- | --- |
| More placements in one synthesized transaction | `packages/frontend/qap-compiler/scripts/configure.js` | `module.exports.S_MAX` |
| Larger public output buffer | `packages/frontend/qap-compiler/subcircuits/circom/constants.circom` | `nPubOut()` |
| Larger public input buffer | `packages/frontend/qap-compiler/subcircuits/circom/constants.circom` | `nPubIn()` |
| Larger public EVM/static input buffer | `packages/frontend/qap-compiler/subcircuits/circom/constants.circom` | `nEVMIn()` |
| Larger private witness/input buffer | `packages/frontend/qap-compiler/subcircuits/circom/constants.circom` | `nPrvIn()` |
| Larger block input buffer | `packages/frontend/qap-compiler/subcircuits/circom/constants.circom` | `nPrevBlockHashes()`, used by `bufferBlockIn_circuit.circom` |

Keep `S_MAX` as a power of two. The backend validates `s_max` as a power-of-two NTT domain size, so
a required value of `257` means the next valid trial is normally `512`, not `257`.

After changing qap-compiler parameters, regenerate the library:

```bash
cd packages/frontend/qap-compiler
npm ci --workspaces=false
npm run build:library
```

`npm run build:library` runs `qap-compiler --build`, which compiles the Circom subcircuits and
rewrites `subcircuits/library` with the generated R1CS files, WASM files, JSON metadata,
`setupParams.json`, `subcircuitInfo.json`, `globalWireList.json`, and `frontendCfg.json`.

Then run the Synthesizer again with the same application transaction snapshot. Repeat the process
until the smallest practical buffer sizes and the smallest valid `S_MAX` are known. Record the
failing application snapshot, the exact error message, the chosen values, and the final generated
library digest or commit so future operators can reproduce the decision.

## Why minimal parameters matter

The qap-compiler values are not harmless limits. They become part of the generated circuit shape:

- buffer sizes affect public, private, and interface wire counts
- `S_MAX` controls the maximum number of subcircuit placements in a synthesized transaction
- backend proving code allocates and processes data over domains such as `n * s_max` and
  `m_I * s_max`
- setup and proving work generally grow when these domains grow

Because of that, the goal is not "large enough for every possible future contract." The goal is the
smallest parameter set that covers the application set the service is actually committing to
support.

## CRS generation and publication

Once the qap-compiler parameters are fixed, generate a CRS for that exact subcircuit library. The
dusk-backed setup flow is:

```bash
cd packages/backend
cargo run --release -p mpc-setup --bin dusk_backed_mpc_setup -- \
  --intermediate ./setup/mpc-setup/output/dusk.intermediate \
  --output ./setup/mpc-setup/output/dusk.final
```

The dusk-backed flow skips Tokamak phase 1, derives the phase-2 source from the pinned Dusk Groth16
raw powers-of-tau artifact, runs Tokamak phase 2, writes the final CRS files, and publishes a zip
archive when Google Drive publication is configured.

Required `.env` keys for publication are documented in
[`packages/backend/setup/mpc-setup/README.md`](./packages/backend/setup/mpc-setup/README.md):

- `TOKAMAK_MPC_DRIVE_FOLDER_ID`
- `TOKAMAK_MPC_DRIVE_OAUTH_CLIENT_JSON_PATH`
- `TOKAMAK_MPC_DRIVE_OAUTH_TOKEN_PATH`

The final output directory contains:

- `combined_sigma.rkyv`
- `combined_sigma.json`
- `sigma_preprocess.rkyv`
- `sigma_verify.json`
- `crs_provenance.json`

The published archive also includes `build-metadata-mpc-setup.json`. Operators should preserve and
publish the provenance and build metadata with the CRS. They bind the CRS to the backend-compatible
version, the subcircuit-library source digest, the pinned Dusk source metadata, and SHA-256 hashes
of the final CRS files.

## CRS governance

Changing the CRS is a governance-sensitive operation. In practice, it is closer to a hard-fork style
coordination event than to replacing an ordinary service configuration file.

A new CRS may be required after qap-compiler parameter changes, circuit changes, backend setup
changes, or backend-compatible version changes. Even if the new CRS is technically valid, applying
it to existing applications should require explicit coordination with users and operators:

- identify which applications and transaction flows require the new capacity
- publish the exact subcircuit-library build and CRS provenance
- keep old CRS artifacts available for applications that still depend on them
- define which CLI/backend versions are allowed to consume the new CRS
- communicate the migration window and rollback policy before changing production services

The CLI downloads the latest CRS archive matching its compatible backend version and verifies the
archive metadata and file hashes before installing it into the local runtime. That protection helps
with accidental mismatch, but it is not a substitute for social and operational agreement about
which CRS the service should trust.
