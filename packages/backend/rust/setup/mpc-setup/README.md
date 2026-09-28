# Tokamak zk-EVM MPC setup

For phase 2 contributors, operators and backend implementers. Filecoin
supplies the externally completed phase 1; this repository implements only
Tokamak phase 2. There is no standalone phase 1 adapter or trusted import
receipt.

## Prerequisites and commands

Follow the [native build prerequisites](../../../README.md#prerequisites).
The executable links ICICLE through the shared native library. When running
`target/release/mpc` directly, include the ICICLE library directory in
`DYLD_LIBRARY_PATH` on macOS or `LD_LIBRARY_PATH` on Linux.

MPC runs only from a local repository checkout. Build one release-optimized
executable for both initialization choices:

- `--step init` starts a publish ceremony and acquires a compatible npm package
  at runtime. Pass `--library-version MAJOR.MINOR.PATCH` to select an exact
  version; omit it to select the latest published version compatible with the
  backend's `MAJOR.MINOR` version. The selected version is recorded in the
  transcript.
- `--step init-dev` starts a development ceremony from the local QAP build and
  requires `--subcircuit-library PATH`. Build QAP first. Its transcript records
  a `null` npm version and cannot authorize publication.
- `contribute`, `verify`, and `finalize` infer the source mode from the input
  transcript.
  Publish transcripts select the recorded npm version; development transcripts
  require `--subcircuit-library PATH` on each operation. The CLI rejects
  `--library-version` outside `--step init`. `upload` accepts only a finalized
  CRS directory and uses its release eligibility metadata. Publish setup
  requires Node.js and npm, does not modify repository manifests or
  dependencies, and has no local-QAP fallback.

Only initialization selects the source mode: use `--step init` for the npm
library or `--step init-dev` for local QAP output. `verify` independently checks
the transcript without writing a CRS. `finalize` repeats that check and writes
the completed CRS locally. The separate `upload` operation
sends that already finalized CRS to Google Drive without replaying the ceremony
or regenerating keys. Neither the Cargo profile nor a Cargo feature selects the
MPC circuit source.

Obtain `challenge_19` directly from the pinned
[Filecoin source](https://trusted-setup.filecoin.io/phase1/challenge_19), or
omit `--filecoin-source` to download it during the operation. The source is
77,309,411,488 bytes (about 72 GiB). Every invocation reads and hashes the
complete original before accepting state or sampling secret shares. Keeping a
local copy avoids a download, not the digest check.

From `packages/backend`:

```sh
cargo build --locked --release -p mpc-setup --bin mpc

target/release/mpc \
  --subcircuit-library ../frontend/qap-compiler/subcircuits/library \
  --step init-dev --filecoin-source /path/to/challenge_19 --output ./initial.mpc

target/release/mpc \
  --subcircuit-library ../frontend/qap-compiler/subcircuits/library \
  --step contribute --filecoin-source /path/to/challenge_19 --input ./initial.mpc --output ./alice.mpc

target/release/mpc \
  --subcircuit-library ../frontend/qap-compiler/subcircuits/library \
  --step contribute --filecoin-source /path/to/challenge_19 --input ./alice.mpc --output ./bob.mpc

target/release/mpc \
  --subcircuit-library ../frontend/qap-compiler/subcircuits/library \
  --step verify --filecoin-source /path/to/challenge_19 --input ./bob.mpc

target/release/mpc \
  --subcircuit-library ../frontend/qap-compiler/subcircuits/library \
  --step finalize --filecoin-source /path/to/challenge_19 --input ./bob.mpc --output ./final-keys
```

For a publish ceremony, use `--step init` without a local library path;
`--library-version <exact-compatible-version>` is optional. For development,
use `--step init-dev` with the local QAP library path. `contribute`, `verify`,
and `finalize` infer the source mode and, for publish transcripts, the exact npm
version from their input transcript. `verify` accepts `--input` but neither
`--output` nor `--library-version`. `upload` takes only the finalized CRS
directory. Do not rebuild the executable to change modes. Run contributor
commands in each contributor's own environment. Initialization is deterministic
and is not a contribution; each transcript output must use a new path.

## Checks and outputs

Source preparation verifies the pinned digest, file length, response header,
and required point families. Initialization derives circuit-specific material
from encoded powers. Each contribution updates the designated phase 2 state and
provides share-knowledge evidence. `verify` checks the full contribution record
chain without deriving keys; `finalize` checks the chain again and the
final-family equations before deriving CRS keys. The
[design record](docs/current-phase2-design.md) defines the exact source mapping,
contribution evidence, and query handling.

Finalization requires at least one verified contribution and writes four common
CRS payloads plus `crs_provenance.json`, which records the cumulative verified
phase-2 contribution count. Finalizing an `init-dev` transcript records
`releaseEligible: false`; finalizing an `init` transcript marks the verified
CRS release-eligible. Ordinary proving users can consume distributed tau files;
contributors must authenticate the original Filecoin source themselves.

## Upload a finalized CRS

After `finalize` has verified the transcript and produced a release-eligible
CRS directory, upload only that completed output:

```sh
target/release/mpc \
  --step upload --crs-directory ./rust/setup/output/crs
```

The upload operation does not accept a transcript, library version, or Filecoin
source. It checks that the local directory contains a release-eligible CRS with
valid payload digests, then transfers those files. It does not verify the
ceremony or regenerate CRS keys. If a transfer is interrupted, rerun `upload`
with the same finalized CRS directory. The standalone
`check_crs_publication` tool checks metadata and payloads only; it neither
verifies a ceremony nor authorizes upload.

Configure these environment variables only in the operator environment:

| Variable | Purpose |
| --- | --- |
| `TOKAMAK_MPC_DRIVE_FOLDER_ID` | Writable CRS root folder. |
| `TOKAMAK_MPC_DRIVE_OAUTH_CLIENT_JSON_PATH` | Installed-app OAuth client configuration. |
| `TOKAMAK_MPC_DRIVE_OAUTH_TOKEN_PATH` | Owner-only token-cache path. |

Keep credential files outside Git. Finalization verifies the transcript and
creates the local CRS before upload. Upload checks the completed payloads and
their SHA-256 values, rejects conflicting releases, and does not overwrite
published artifacts. A failed upload preserves local output and reports the
failed stage.

## Qualification and security status

The operator workflow verifies source, transcript, circuit identity, and
published artifacts. These operational checks do not by themselves certify an
application or Tokamak-specific phase 2 extensions.

Repository contributors can follow the [qualification guide](docs/qualification.md)
for development-only native E2E checks and release test scope. The
[MPC optimization report](../../../docs/optimization/current-univariate-mpc.md)
contains measured performance and reproduction evidence.

The [phase 2 design record](docs/current-phase2-design.md) and
[security references](docs/security-references.md) describe the contribution
construction, its assumptions, and the deferred analysis of Tokamak-specific
extensions. They are design material, not a live-ceremony qualification or
security certification.

## License

The MPC setup implementation and documentation are dual-licensed under
`MIT OR Apache-2.0`.
