# Current univariate MPC: local arithmetic and native E2E

## Audience and qualification boundary

This report is for backend implementers and performance reviewers. It covers
deterministic CPU improvements to the current phase-2 implementation, measured
on 2026-09-13. It is separate from the trusted-setup and prover report because
MPC manipulates imported bases and validates public contribution records.

The selected code passed isolated release experiments and a full local-library
test-MPC-output native E2E on 2026-09-13. Two contributions were verified, final
keys were written, and native preprocess -> prove -> verify returned `true`;
the native tamper regression also passed. This qualifies the local integration
path, not a live ceremony. The single whole-path timing below is not a paired
speedup measurement. No authenticated live Filecoin ceremony, publication or
security certification is claimed. Do not add nested timings or multiply the
isolated speedup factors.

## Control, inputs and measurement method

The deduplicated control is `fa70ec061`. It checks a newly appended state once,
rechecks every external record on import, and does not recheck an unchanged
verified state during projection. Two contributions in one continuous test
invocation require two full state checks. Importing those two records in a
separate finalizer still requires two full checks. Arithmetic experiments do
not change these invocation boundaries.

- Host: Apple M4 Pro, aarch64 macOS, 48 GiB physical memory; default Rayon pool
  reported 14 workers. No host-specific worker count is compiled into the code.
- Compiler: Homebrew `rustc 1.95.0 (59807616e 2026-04-14)`; workspace release
  profile, locked offline dependencies, arkworks 0.5.0; no CUDA measurement.
- Harness: [phase2_bench.rs](../../rust/setup/mpc-setup/src/phase2_bench.rs).
  Fixed seeds in each test define synthetic points and shares; these are not
  authenticated Filecoin data or a local-QAP ceremony output.
- One warmup round per variant, then five retained rounds. Variant order
  rotates per round. No other task-owned expensive computation ran concurrently.
  Times exclude compilation and common input generation, and include each
  candidate's allocations, preparation and materialized output. Equality
  assertions are outside the measured region unless the operation being timed
  is itself validation. Reported values are arithmetic means in seconds.
- Raw samples retain every measured round, counts and preparation times.
  Early harness variants are explicitly identified below; their binaries were
  not preserved. Reproduce final variants from the committed harness rather
  than assuming historical samples came from the final source byte-for-byte.

## Selected kernels

| Operation and workload | Control | Selected | Reduction | Evidence |
| --- | ---: | ---: | ---: | --- |
| 32,768 separate pairing equalities, 1,024 reused wire G2 operands | 4.347778 | 2.397707 | 44.9% | [Pairing samples](evidence/mpc-pairing-parallel-preparation.json) |
| Decode and admit 32,768 G1 points | 1.151933 | 0.104494 | 90.9% | [Decode samples](evidence/mpc-decode.json) |
| Packed query and correction update, 32,768 points each | 0.826325 | 0.508208 | 38.5% | [Final update samples](evidence/mpc-query-update-final.json) |
| Fixed query and correction update, 32,768 points each | 0.607711 | 0.293146 | 51.8% | Same update samples |
| Verify 1,024 share proofs, product pairing in both variants | 2.724806 | 0.252840 | 90.7% | [Share verification](evidence/mpc-share-verification.json) |
| Generate 1,024 dense-scalar share proofs, including serial point sampling | 0.851490 | 0.107418 | 87.4% | [Share generation](evidence/mpc-share-generation-dense.json) |
| Serialize 262,144 G1 points and hash the resulting 24 MiB | 0.061153 | 0.046753 | 23.5% | [Serialization plus unchanged SHA](evidence/mpc-serialization-with-hash.json) |

### Pairing: preserve every individual equation

The [shared helper](../../rust/setup/mpc-setup/src/phase2_pairing.rs) checks
`e(A,B) * e(-C,D) = 1` with one multi-Miller loop and one final exponentiation
instead of two complete pairings. This is exactly one equality, not aggregation
of unrelated equalities. Two invalid equalities with canceling errors must both
fail. The engine prepares H, delta G2 and the per-wire G2 operands once per
state check. Table construction is parallel, and arkworks' required prepared
operand cloning is included in the measurements.

The implementation was checked against the pinned ark-ec 0.5.0
`Pairing`/BLS12 implementation. Existing APIs are used; there is no custom
Miller loop, probabilistic batch test or persistent trust cache.

### Decode and admit once

The [transcript parser](../../rust/setup/mpc-setup/src/phase2_transcript.rs)
decodes fixed-width records in ordered parallel ranges. Its unchecked
deserialization is only syntax parsing: it does not admit a group element.
`Engine::verify_state` checks all state points for curve/subgroup membership,
shape and role-specific nonidentity before state or predecessor pairings.
`ShareProof::verify` independently admits every proof point before its pairings.
Neither an in-memory state nor a raw proof gains admission by skipping decoding.

Parallel checked decoding followed by the same admission took 0.209204 s;
removing duplicate group checks after parallelizing gives the further
0.104494 s result. Source archive decoding is a different ingress and retains
its existing parallel canonical-coordinate and curve/subgroup checks:
[32,768-point source measurement](evidence/mpc-source-decode.json), 0.105767 s.
No source authentication or full-source digest check was removed.

### Scalar products, normalization and immutable images

For packed queries, compute `C' = v_j C / u` and
`Q' = (Q-C)/u + C'`. Across both outputs this replaces three scalar products
with two. For fixed-public queries, `u=1`, replacing two products with one.
The wire factors are computed once and zeroized after use. No independently
required query is collapsed into an MSM or omitted.

Projective outputs use ordered chunks of 4,096 points with arkworks
`normalize_batch`. This is a scheduling choice, not a circuit capacity or a
worker-count setting. [Normalization-only samples](evidence/mpc-normalization.json)
compare individual, whole-batch, 1,024-point and 4,096-point chunks. The two
chunk sizes are close; no claim of universal optimality is made.
[Materialization stage samples](evidence/mpc-point-materialization.json) include
the group operation, temporary storage and affine output: initialization-style
addition improves from 0.020362 s to 0.002174 s; weighted scaling improves from
0.307156 s to 0.288292 s. These changes are applied to query initialization and
weighted/shifted update output, not to tiny role/mask arrays without evidence.

[Initial-difference samples](evidence/mpc-initial-differences.json) include cache
construction and cloning: four uses take 0.079512 s with individual conversion,
0.008231 s with repeated batch normalization and 0.003904 s with an immutable
batch-normalized cache. The engine keeps public initial packed differences
for its own lifetime; current-state differences are batch-normalized each
check. This cache is not serialized and conveys no trust across invocations.
It has not yet demonstrated a whole-command gain with the full library.

### Ordered parallel proof work and serialization

Proof generation first samples public random points serially in the original
RNG order, then performs independent wire-proof arithmetic in parallel and
serializes in wire order. It does not split seeds, change the sampler or reuse
a public-scalar random base. The serial and parallel proof records and the next
RNG output are equal in regression tests. Proof validation and predecessor
links are independently parallel, with every wire still checked.

State serialization reserves the final size and writes nonoverlapping canonical
uncompressed point ranges in parallel. Hashing consumes exactly the same bytes
using the unchanged SHA implementation. Preallocation alone did not establish
a useful gain (0.061153 s growing buffer versus 0.060148 s reserved buffer,
including hashing). The selected parallel variant includes zero-fill and hash
costs. Transcript layout, final archive formats and atomic file writes are
unchanged.

## Rejected alternatives and exploratory records

- Cached target-group pairing outputs lose after including construction:
  two uses, 0.683458 s versus 0.552296 s prepared-product control; four uses,
  1.162873 s versus 1.099727 s. [Samples](evidence/mpc-pairing-cache.json).
  No target-group table is retained in production.
- Prepared operands with serial table construction were not a win at 4,096
  equations. [Initial series](evidence/mpc-pairing.json) and
  [expanded reuse series](evidence/mpc-pairing-expanded.json) explain why the
  final experiment also measured larger reuse and parallel preparation.
  Do not attribute cross-series desktop variation to a single change.
- [Initial update series](evidence/mpc-query-update.json) multiplied the fixed
  control by one unnecessarily. The [exact-control series](evidence/mpc-query-update-exact-control.json)
  removes that extra group operation. The final reported series additionally
  includes clearing the packed secret-factor table and directly uses the wire
  factors for fixed queries, matching the production call sites.
- [Small-scalar proof generation](evidence/mpc-share-generation.json) is only an
  exploratory record. Acceptance uses the later full-width random-scalar run.
- [Initial serialization series](evidence/mpc-serialization.json) excludes SHA
  and uses 32,768 points. It is not the serialization-plus-hash acceptance row.
- No fixed-generator precomputation was transferred blindly from trusted setup
  to imported variable bases. Optional generator-table tuning and sparse public
  image construction changes remain unselected; full initialization profiling
  must justify further candidates. No SHA acceleration was measured.

## Memory and verification

These changes trade memory for speed. Query updates retain two projective
arrays before normalization; checks allocate current-state differences and
prepared per-wire G2 tables. The engine also retains one affine initial-image
array. Memory is not capped and thread selection remains Rayon-controlled.
`phase2_bench::allocation_layout` reports the pinned implementation's element
and prepared-table backing sizes; these are allocation estimates, not peak
whole-ceremony RSS. The full-library test below reported 10,042,687,488 bytes
(9.353 GiB) maximum resident set size through macOS `/usr/bin/time -l`.

On this build G1 affine/projective values occupy 104/144 bytes and Fr occupies
32 bytes. A nonidentity G2Prepared has a 32-byte header, 19,584 bytes of live
coefficients and 36,864 bytes of allocated coefficient capacity. For 1,024
wire operands the initial table therefore reserves about 36 MiB plus headers;
each consumed clone copies its live coefficients. A packed-image cache for
6,006,942 entries occupies about 596 MiB excluding its vector header. These
figures explain the additional storage; they are not a full process peak.

Release regression tests cover exact finalized bytes for all four CRS files
against trusted setup after two contributions; independent-import and continuous
transcript identity; unchanged check counts; malformed encoding, curve/subgroup,
identity, shape, replay and context failures; cancellation-resistant individual
pairing checks; query-update identity/unit/dense cases; and serial/parallel
state/proof byte equivalence. These unit tests are separate from the completed
full-library native E2E below; neither authenticates a live Filecoin source.

The final release suite, both without and with the `timing` feature, passes
38 unit tests (one is an allocation-layout diagnostic) and six derivation tests.
A separate one-worker run passes the
phase-2 regression subset. The ignored native fixture is not included in these
counts; ignored benchmark tests were invoked separately as described above.

Repository document-readiness checking now passes for the tracked WASM
documentation. The retired `combined_sigma.rkyv` name remains only where
historical migration records identify the format; it is not a current runtime
input.

## Full local-library MPC-output native E2E

The implementation at `c082122e4a8e73612f1ff0e535c2e1a214b5cf68` completed
this run in `/tmp/tokamak-mpc-native-e2e-optimized-BMRiqX`. All commands used
the release profile on the CPU host above; MPC and prove enabled `timing`.
[Run evidence](evidence/mpc-native-e2e.json) preserves commands, logs, nested
timing events, artifact hashes, provenance and the fixture-preparation script.
These are single-run observations, not repeated means or cold-cache results.

The input was the current local `qap-compiler/subcircuits` build, not its older
`dist` copy or an npm snapshot. Its digest was
`sha256:e2d425690aa68524ffa46a755d0a1eab7419d202f44a16805852c5dbfbdb0c92`.
It contains 44 compiled circuits, with `n=1024`, `m=1024`, `t=64`,
`s_max=256`, `l_free=256`, `l=396` and `m_D=45056`. Local library and
synthesizer inputs were copied into an isolated run directory before native
execution. The test generated standard-generator synthetic tau, discarded
the trusted-setup oracle's other keys, and used production MPC initialization,
two contribution updates, complete record checks and final-key projection.
The test's two-state-check assertion passed. No separate external-transcript
finalizer was invoked; its independent-import checks are not bypassed by this
continuous-invocation result.

### MPC preparation and final files

| Stage | Seconds |
| --- | ---: |
| Test input and synthetic tau preparation | 10.563 |
| MPC initialization | 399.889 |
| Contribution 1, including its new-record verification | 978.975 |
| Contribution 2, including its new-record verification | 990.024 |
| Final projection and archive publication to the local directory | 6.041 |
| Fixture total, including intervening work | 2387.779 |
| Cargo test process wall time, including 6.05 s compilation | 2394.72 |

Within contributions 1 and 2, state equations took 837.063 s and 845.213 s;
point admission took 39.345 s and 38.976 s; query updates took 94.951 s and
98.463 s. State equations remain the dominant measured cost. Record validation
includes state admission and equations; these nested spans must not be added
again to contribution time. The 0.101 s `mpc.final_projection` span is narrower
than the 6.041 s projection/archive stage, which includes output preparation,
serialization, hashing and writes. No additional optimization was selected
from this single run.

| Final archive | Bytes |
| --- | ---: |
| `tau_sequence.rkyv` | 301,992,400 |
| `prover_keys.rkyv` | 626,999,056 |
| `preprocess_keys.rkyv` | 28,276,128 |
| `verifier_keys.rkyv` | 1,104 |
| Total, excluding provenance | 957,268,688 |

`crs_provenance.json` is also present (1,058 bytes). It records
`generationMethod: "mpc"`, `origin: "localQapCompiler"`, package version
`2.1.5`, `releaseEligible: false` and `phase1SourceProvenance: null`.
The four recorded SHA-256 values were matched against the files after the run.
This provenance does not assert that the synthetic tau came from Filecoin.

### Native consumers and recovered fixture failure

The initial preprocess attempt rejected an old saved selector containing
`4294967295`: the current producer and backend reader use signed `-1` for
inactive placements. The failed attempt is preserved separately in the evidence.
The current synthesizer `derivePlacementSelector` function regenerated only
the test copy of `selector.json`, using the snapshotted placements, witness
and library metadata. Its 207 active entries were unchanged; the 49 inactive
entries became `-1`. No backend acceptance fallback, production-code change,
original-fixture modification or MPC rerun was needed. Reproduction requires
current producer output, not the stale positive-sentinel selector.

| Native command | Internal elapsed, seconds | Cargo run wall, seconds | Maximum RSS, bytes |
| --- | ---: | ---: | ---: |
| Preprocess | 0.382203 | 0.68 | 229,457,920 |
| Prove | 3.758160 | 4.28 | 2,727,706,624 |
| Verify, input plus online verification | 0.004044 | 0.56 | 9,633,792 |

Each binary was release-built before its timed `cargo run`; the wall column
still includes Cargo startup and process overhead. Internal prove time includes
input loading and proof output; its protocol span alone was 3.348863 s.
Prove used the existing default without optional full artifact digest checking.
No release-eligibility bypass or live-source qualification was added.

The verifier was freshly compiled with `TOKAMAK_VERIFIER_KEYS` set to this
MPC result's verifier key and with local-QAP build-time constants. It returned
`true` for the new 1,184-byte proof and 384-byte preprocess artifact. The
release `accepts_real_proof_and_rejects_tampering` test passed: changed public
input, all ten proof-point identities, seven changed scalar evaluations and
each of the three changed preprocess operands were rejected; malformed length,
scalar and subgroup cases were also rejected. This completes the local native
acceptance gate, not WASM interoperability or independent live contributors.

## Reproduction

Run from `packages/backend` with a fresh existing output directory:

```sh
cargo test --locked --offline --release -p mpc-setup
cargo test --locked --offline --release -p mpc-setup --features timing
MPC_BENCH_DIR=/absolute/path/to/evidence cargo test --locked --offline --release \
  -p mpc-setup --lib phase2_bench::pairing -- --ignored --exact --nocapture
```

Run the other ignored `phase2_bench` functions individually, not concurrently.
The source fixes seeds, sizes and order; JSON contains the retained raw samples.
`allocation_layout` is a regular diagnostic test, not a timed experiment.

The opt-in `timing` feature emits `[mpc-timing]` JSON events from the executable
and the ignored native fixture. It covers command, initialization/source decode,
update, record decode, point admission, share generation/verification, state
equations, predecessor/chain hash, state hash, serialization and projection.
Spans nest: never sum a parent with its children to estimate command time.

The completed E2E used the [documented test-MPC path](../../rust/setup/mpc-setup/README.md#native-e2e-with-test-mpc-output)
with `--locked --offline --release --features timing`; the evidence retains
the exact native commands and verifier-key environment. For another run, use
a fresh output directory, current producer fixtures and a freshly built
verifier. The earlier full fixture was interrupted during its second
contribution, produced no final keys and did not run native consumers. Its
416.675 s initialization and 3659.122 s first contribution used the older
duplicate-check path; neither is a paired control for the table above.
