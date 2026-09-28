# Historical current-protocol WASM optimization opportunity profile

## Audience and decision

For backend engineers selecting the next WASM optimization experiments.
This is a historical diagnostic profile of the implementation at
`cd72c162281c2b4058e6bbc70e130988ec4ed516`, captured before the W0 policy
was implemented. It is not the current execution plan, an accepted
optimization, or a new protocol/CRS-format decision. No production algorithm
was changed by the snapshot described here. The current W0--W7 status and
evidence are maintained in the [current univariate CRS report](current-univariate-crs.md).

Prioritize unnecessary data movement, undersized worker jobs and avoidable
algebra before changing the arithmetic library. The prover already uses
parallel ffjavascript FFT/MSM. Its high-level TypeScript polynomial operations
still execute many scalar calls and allocations, and its two-entry CRS cache
does not match the complete proving access pattern.

## Measurement conditions and limitations

- Apple M4 Pro, 14 logical CPUs, 48 GiB RAM; headless Chrome 153.
  The runtime reported 14 workers for each of the three installed curve runtimes.
  The hardware concurrency is discovered by the dependency, not hardcoded to
  this machine.
- Minified esbuild ES2022 browser bundle, ffjavascript 0.3.1, current generated
  local-QAP circuit library and fixed verifier input. There is no Rust debug
  arithmetic in the measured browser path. Minification is not a claim that
  the browser arithmetic is equivalent to a Cargo release build.
- Existing P8 trusted-setup CRS and 207-placement application fixture;
  `n=1024`, `m=2048`, `m_b=512`, `s=256`, `t=64`, 44 compiled circuits,
  `N_A=262144` and `N_C=131072`. Actual compressed CRS only; no dense archive
  or reader.
- MSM delivery bounds: 262144 points for prove, 131072 for preprocess.
  Physical CRS chunks are at most 8 MiB (87381 G1 points in a full chunk).
- Two profiled runs and two completed uninstrumented controls. Each run
  reloads the page, loads inputs, installs the runtimes, then executes
  preprocess, prove and verify sequentially. Every completed run returned
  `true`, emitted a 1184-byte proof and matched native preprocess bytes.
  One earlier control was navigated away before its result was captured and
  is excluded; it is neither a pass nor a timing sample.
- Timings include lazy localhost CRS fetch, chunk SHA checking, allocation,
  worker transfer, arithmetic and output within each public API call.
  Initial fixture/module loading and compilation are excluded; installation
  is separate. Browser/OS caches were not flushed. This is not a WAN-download
  benchmark, cold-disk benchmark, or peak-memory measurement.
- Instrumentation is injected only into a diagnostic bundle. Source arithmetic
  is unchanged. Coarse stage spans partition each call; operation measurements
  are inclusive and can overlap. In particular, the four concurrent witness
  IFFT durations must not be summed as elapsed time.
- Two samples identify large bottlenecks; they do not establish small speedups.
  No candidate was benchmarked or accepted in this review.

Raw samples: [profile evidence](evidence/current-univariate-wasm-profile.json).
Existing fixture/CRS identity and historical Chromium 149 qualification:
[P8 evidence](evidence/current-univariate-e2e.json).

### Whole-call timings

| API | Uninstrumented run 1 (s) | Uninstrumented run 2 (s) | Mean (s) | Profiled mean (s) |
| --- | ---: | ---: | ---: | ---: |
| install | 0.176025 | 0.176630 | 0.176327 | 0.176345 |
| preprocess | 3.948915 | 3.872850 | 3.910882 | 3.886733 |
| prove | 48.969780 | 49.192960 | 49.081370 | 48.832385 |
| verify | 0.025230 | 0.025525 | 0.025377 | 0.025868 |

The profiled prove mean is about 0.5% below the control mean; the runs do not
resolve instrumentation overhead from ordinary variation. The earlier P8
38.090625-second sample used Chromium 149 and a different harness. It is not
a paired control for this profile, so the approximately 49-second measurement
must not be labeled a code regression or attributed to a browser change.

## Prove stage table

Mean of two instrumented runs. Commitment/opening rows include the CRS reads,
scalar conversion and MSM they call. Percentages use the 48.832385-second
profiled public prove mean, not the native prover time.

| Sequential stage | Mean (s) | Prove share |
| --- | ---: | ---: |
| Input admission, domain and witness slots | 0.006 | 0.01% |
| Permutation polynomial | 0.152 | 0.31% |
| Witness maps (sparse R1CS + four IFFTs) | 0.368 | 0.75% |
| Public checks and polynomial blinding | 0.412 | 0.84% |
| Arithmetic quotient q_A | 1.311 | 2.68% |
| Commitments C_L and C_H | 7.358 | 15.07% |
| Binding commitment C_O | 7.245 | 14.84% |
| Selected roots and witness rearrangement | 0.026 | 0.05% |
| Selection quotients | 5.027 | 10.29% |
| Commitments D_Q and D_Q,K | 3.694 | 7.56% |
| Commitment C_D | 3.632 | 7.44% |
| Copy recurrence | 2.486 | 5.09% |
| Copy interpolation and linear operands | 0.401 | 0.82% |
| L_0 materialization | 0.301 | 0.62% |
| Copy boundary quotient q_C,0 | 1.232 | 2.52% |
| Copy product quotient q_C,1 | 2.453 | 5.02% |
| Commitment C_R | 1.791 | 3.67% |
| Quotient combination | 0.245 | 0.50% |
| Commitment C_Q | 1.799 | 3.68% |
| Seven challenge-point evaluations | 0.665 | 1.36% |
| Opening polynomial combination | 0.355 | 0.73% |
| Opening proof pi_chi | 5.977 | 12.24% |
| Opening proof pi_plus | 1.893 | 3.88% |
| Remaining transcript and encoding | 0.006 | 0.01% |
| Total public prove | 48.832385 | 100% |

### Operation breakdown inside those stages

These rows overlap the stage table and, where indicated, each other. They
must not be added to the stage totals.

| Operation boundary | Mean (s) | Interpretation |
| --- | ---: | --- |
| G1 MSM API calls | 19.060 | 242 calls; includes ffjavascript dispatch, worker copying and result reduction, not pure curve instructions |
| CRS range reads | 13.351 | Fetch, digest, copying and cache behavior combined |
| SHA inside CRS reads | 11.905 | Subset of range-read time; 121 hash events covering 931149312 bytes per run |
| Montgomery-to-raw scalar batches | 0.089 | Already batched; not a primary target |
| Polynomial multiply | 3.991 | Includes FFT, pointwise product, inverse FFT and materialization |
| Polynomial add/sub/scale | 2.088 | Scalar-loop work across several stages; excludes scaleArgument |
| Exact vanishing division | 0.636 | Three calls, included in quotient rows |
| Ruffini division | 0.421 | Cofactors plus four opening divisions |

Important observations:

- `C_O` performs 212 MSM calls, but their first-run total is only 0.441 s.
  Its range reads take 6.653 s, including 5.898 s of SHA. It requests 89465
  points (8588640 bytes) across free-public, nonpublic and mask sections but
  hashes 469776192 bytes. This roughly 55-fold read/hash amplification is
  primarily a physical chunk-granularity problem; a larger cache alone cannot
  eliminate the first read of each distinct chunk.
- The two-entry cache also evicts reusable ordinary power chunks between
  commitments. Avoiding repeated validation requires retaining the actual
  validated bytes, not trusting a remembered filename or digest for newly
  supplied bytes.
- Selection quotients call `batchAddScaledBuffer` 35971 times on 256-element
  rows: 9208576 accumulated field elements. Each call shards across 14 workers
  in this measurement, yielding 503594 queue submissions. The per-row kernel
  is already WASM; the inefficient unit of scheduling is the problem.
- The copy recurrence uses 262143 individual divisions plus the final
  closure check. The `L_0` construction separately computes the same inverse
  262144 times. These are visible in the source, not inferred from the FFT time.

## Candidate experiments, in recommended order

The measured target intervals below are not predicted savings. Candidate
effects overlap; do not add them or promise a final latency.

### W0. Align CRS digest policy with native prove, then rebaseline

Historical proposal recorded on 2026-09-13; the policy was subsequently
implemented and accepted. At the time of this profile, implementation had not
started. The proposal was:

Native prove's `--check-digests` defaults to false. WASM runtime CRS reading
will follow the same opt-in policy: no payload digest computation by default,
with an explicit per-call `checkDigests: true` option to request it. Apply
the same default in the shared reader used by prove and preprocess; do not
make it depend on input origin, build optimization or a sticky install option.

Keep existing metadata/schema, lengths, section ranges and arithmetic checks.
Keep digest fields and their format checks in the manifest. When enabled,
check every loaded chunk against its declared digest and fail on mismatch;
do not silently retry with checks disabled. This validates consumed browser
chunks, not the original RKYV archives or unused roles. Do not reconstruct
native files or add runtime npm-library hashing merely to mimic native storage.
The converter/build-time integrity workflow and online verifier are unchanged.

Tests must prove zero CRS payload-hasher calls in the default path, positive
checks and mismatch rejection in the opt-in path, unchanged structural failure
behavior in both, and no option/cache state leaking between invocations.
Default mode does not promise early detection of well-shaped byte corruption
through a digest. Record this boundary explicitly in the public API docs.

Run native/WASM E2E and repeat both default/off and explicit/on timings before
W1. Preserve all tables above as the pre-change digest-on evidence. Subtracting
11.905 seconds from the prior total is not a new measured default baseline.
The policy change is required independently of its measured speed effect;
later arithmetic/data-delivery candidates still require demonstrated gains.
No SHA acceleration experiment is included.

### W1. Fuse selection accumulation into coarse WASM tasks

Target: selection quotient, 5.027 s.

Keep the existing shared-cofactor mathematics. For a batch of independent wire
rows, pass the cofactor matrix and witness rows once and accumulate all active
slot contributions inside the kernel. Partition output wire rows over the
existing ffjavascript workers, keeping each output row's reduction local.
Do not create one task per scalar-times-256-element-vector operation.

This adapts the successful historical whole-loop/worker-batching approach;
the native shared-cofactor optimization is already present mathematically.
The cofactor matrix is about 2 MiB at s=256. Measure complete transfers and
assembly, not just kernel instructions. Check exact coefficients against the
current cofactor sum for sparse/dense witnesses, inactive slots and unequal
domains, then deterministic proof bytes and native/browser verification.

### W2. Cancel the copy-boundary vanishing factor

Target: L_0 construction plus q_C,0, 1.533 s.

Use the existing native identity:
`q_C,0 = (R_hat - 1) / (N_C * (X - 1))`.
It follows from
`L_0=(X^N_C-1)/(N_C*(X-1))`.
A linear synthetic division and one scale replace the dense L_0 polynomial,
a large polynomial multiplication and the following vanishing division.
Check the remainder to preserve `R_hat(1)=1`, including its masking terms.
Reuse the native independent identity fixtures; include singleton domains and
nonzero-remainder rejection. This is an implementation specialization, not a
change to transcript or proof.

### W3. Batch copy denominators, then fuse the ordered recurrence

Target: copy recurrence, 2.486 s.

Construct denominators, reject every zero, call the existing
`batchInverseBuffer`, and multiply ratios in the original order. Move the
whole ordered recurrence into WASM to avoid per-element JS/WASM crossings.
Reuse the native batch-inversion method; do not blindly reuse the historical
bivariate recurrence kernel, whose traversal/order differs.

Keep the closing-cycle check and exact error behavior. A segmented prefix
scan is a later experiment only if the ordered WASM loop remains a bottleneck;
it is not necessary for the first candidate.

### W4. Reduce CRS overfetch and repeated loading, without weakening admission

Target: 13.351 s of reads, including 11.905 s of SHA across prove.

Test separately:

1. Smaller physical chunks for sparse `crs.nonpublic-queries` within the
   existing manifest contract; retain larger sequential power chunks.
   Measure fetched/hash bytes and request count as well as latency.
2. Retain reused power-chunk bytes within one proof invocation using a
   byte-budgeted cache or explicit lifetime-based retention. The current
   fixed two-entry policy is not a performance requirement. Avoid a global
   trust cache or cross-proof stale-byte assumptions. In opt-in digest mode,
   reuse a digest result only while retaining the exact checked bytes.
3. Return a view when a requested range lies in one retained immutable chunk;
   otherwise use bounded gathering. Index chunk ranges instead of rescanning
   all descriptors if the scan is material in later profiles.

The optional reader-controlled memory budget must not be tuned only to this
host. Preserve bounded MSM calls even when more memory is available.
Reprofile this target on W0's digest-off default; the original 13.351-second
interval includes SHA and is not the new loading baseline. Keep structural
rejection in both modes and digest-mismatch rejection in opt-in mode, plus
roles, public/nonpublic indexing and producer contracts. No SHA acceleration
experiment or further digest-policy change is part of W4.

### W5. Requalify MSM delivery, fusion and zero filtering

Target: 19.060 s of MSM API time, distributed across commitment/opening rows.

Start with combining multiple source arrays that contribute to the *same*
commitment into bounded MSM calls. Gather selected nonpublic ranges and
nonzero scalar/base pairs, preserving their exact alignment. Test
density-aware zero filtering, adapting the accepted native filtering and
historical WASM sparse-batch approach. Measure gather, scan, conversion,
dispatch and output together. Never combine distinct transcript messages.

Sweep bounded outer sizes only after selecting the data-delivery strategy.
The existing 262144-point bound is the control, not an internal Pippenger window
parameter. A new outer Web Worker layer, unbounded MSM and wholesale affine-to-
projective conversion repeat previously rejected approaches and are not proposed.

The setup fixed-base table technique does not directly apply to sums over
different CRS bases. Native per-proof precomputation/cache rejection is retained;
reopening it would require a new measured reuse case, not an assumption that
more precomputation is faster.

### W6. Replace high-volume scalar polynomial loops with whole-buffer kernels

Targets overlap blinding, linear combinations, shifts, evaluations and openings:
add/sub/scale 2.088 s, vanishing division 0.636 s, Ruffini 0.421 s and seven
evaluations 0.665 s.

Adapt existing backend-owned linear, Horner, Ruffini and division kernels to
the actual one-dimensional layout only where their semantics match. Fuse
`a + c*b`, multi-term combinations and low-degree mask insertion to avoid
intermediate full-size buffers and repeated trimming copies. Reuse argument
power vectors or batch-apply-key only when measured faster.

Preserve sequential dependency within a recurrence; parallelize independent
polynomials or valid coefficient classes through the existing worker pool.
Use size thresholds from isolated tests so small polynomials stay inexpensive.
A new adapter layer is not required merely to rename existing APIs.

### W7. Reduce quotient FFT work using polynomial structure

Targets: q_A 1.311 s and q_C,1 2.453 s; remeasure after W2/W6.

Masking raises the product length just above a power-of-two boundary, causing
the current generic multiply to choose a 1048576-element FFT. Experiment with
separating the short mask terms from the unmasked polynomial product, reducing
the main product's transform size where algebra permits. Independently check
the exact quotient including every mask term.

For q_C,1, test subtracting the two products in the evaluation domain before
one inverse transform and reusing compatible transform data. A shifted
argument can reuse a spectrum by an index rotation only after proving that
the chosen FFT domain and root make the rotation exact. Retain generic
unequal-domain behavior. Blind concurrent scheduling of already parallel FFTs
is not an accepted optimization.

### W8. Tune preprocess separately — discarded

Preprocess is not part of the public prove timing. This proposal was discarded
on 2026-09-20 without implementation; the details below are historical
profiling notes, not an active optimization plan.

- Move the selected/unselected polynomial long division into a whole-loop
  WASM kernel first, preserving exact remainder checks. Only consider
  reversed-polynomial/Newton quotient construction if an isolated benchmark
  justifies its additional complexity.
- Reuse W4/W5 findings for S_C's range read and MSM, measuring the
  preprocess-specific access pattern independently.
- E_kappa has a G2 MSM; preserve its group and do not reuse a G1-specific
  window rule without measurement. C_fix and root construction are minor.

### W9. Verify only after larger targets are exhausted — discarded

Verification is approximately 25 ms, not a current end-to-end bottleneck.
This proposal was discarded on 2026-09-20 without implementation.
Fixed G1 tables and four fixed prepared G2 operands already exist. Possible
later tests are fused dynamic G1 linear combinations and dispatch-threshold
tuning for the 256-element public interpolation. Keep canonical coordinate,
subgroup and artifact admission checks. Keep one final exponentiation for the
pairing product; no reason to undo the existing fixed-input precomputation.

## Preprocess and verify detail

Mean of two profiled runs; milliseconds.

| Preprocess stage | Mean (ms) |
| --- | ---: |
| input-admission | 0.763 |
| domain | 0.040 |
| selected-roots | 18.047 |
| permutation | 160.855 |
| public-check | 1.838 |
| commit-SC | 1724.585 |
| commit-Cfix | 2.933 |
| unselected-division | 1630.657 |
| commit-Ekappa | 346.527 |
| encode | 0.443 |

| Verify stage | Mean (ms) |
| --- | ---: |
| decode | 6.655 |
| online | 1.775 |
| field-algebra | 1.013 |
| group-algebra | 7.385 |
| prepare-G2 | 0.505 |
| pairing | 8.510 |

The verify `online` interval here is transcript reconstruction before field
algebra; it is not an additional parent total. Decoding includes mandatory
dynamic point/field checks. No runtime verifier CRS load exists.

## Experiment gate and remaining plan

The profiling/recommendation checkpoint is complete. These tables retain
the original SHA-inclusive baseline and are not timings of the optimized
implementation. The [execution report](current-univariate-crs.md) records
W0--W7 completion and their sequential qualification, including rejected
experiments; W8/W9 were later discarded. For each retained optimization candidate:

1. Preserve this compressed-CRS implementation as the reference.
2. Run isolated exact polynomial/group tests, including affected rejection
   cases and complete boundary costs.
3. Run native/WASM E2E and cross-verification; use deterministic test-only
   masks for byte equivalence, not a production deterministic RNG.
4. Alternate control/candidate release-optimized measurements with enough
   repetitions to distinguish improvement from variation. Measure the
   complete API and separate loading/arithmetic, including memory impact.
5. Record acceptance or rejection before the next candidate.

In the historical sequence, W0 preceded the W1--W7 prove sequence. W8 and W9
were separately scoped preprocess and verifier proposals before their later
discard. Apart from the approved W0 digest policy, no trust-policy or
artifact-contract change was implied. This historical review did not run live
MPC, publish artifacts, change versions, or reinstate a dense-CRS performance
benchmark.

## Reproduction and source evidence

Diagnostic-only files:
[current-univariate-server.mjs](../../wasm/test/profiling/current-univariate-server.mjs)
and [browser entry](../../wasm/test/profiling/current-univariate-entry.ts).
From `packages/backend/wasm`, with P8 local generated bindings still selected:

```sh
node test/profiling/current-univariate-server.mjs /tmp/tokamak-p8-trusted-e2e-9jQ5E1
```

The script prints a localhost origin. Open `/?profile` for the injected
diagnostic bundle or `/` for the uninstrumented control. Invoke
`window.run()`, wait for `window.result.status` to become `ok` or `error`,
and export `window.result`. Reload before the next run. All inputs are
existing files; the harness does not create CRS or change production source.

Raw operation `elements` counters preserve the original probe: field-buffer
operations count 32-byte units, G1/G2 MSM count input bytes divided by 32
(divide by 3/6 for points), CRS reads count points, and SHA counts bytes.
Scalar/polynomial arguments and sparse-row offset units are not meaningful
work-size estimates; only their call counts and times are used here.

Relevant implementation:

- [Current prover schedule and copy/binding work](../../wasm/src/univariate/reference-prover.ts).
- [Polynomial operations](../../wasm/src/univariate/polynomial.ts),
  [selection cofactors](../../wasm/src/univariate/selected-roots.ts).
- [CRS chunk reader/cache](../../wasm/src/univariate/chunked-crs.ts),
  [MSM delivery](../../wasm/src/runtime/group/affine-msm.ts).
- [Existing field kernels and dispatch](../../wasm/src/runtime/field/field-runtime.ts).
- [Native accepted optimization report](current-univariate-crs.md), especially
  shared cofactors, bulk inversion, combined-source MSM and P13 boundary/filtering.
- [Historical WASM optimization evidence](../../wasm/docs/optimization/prover-optimization-history.md);
  reuse measured engineering approaches, not the retired bivariate protocol
  or its timing figures.
- The installed ffjavascript 0.3.1 sources were checked locally. Upstream
  [MSM implementation](https://github.com/iden3/ffjavascript/blob/master/src/engine_multiexp.js)
  and [thread manager](https://github.com/iden3/ffjavascript/blob/master/src/threadman.js)
  also document worker task dispatch and hardware-concurrency discovery.
  Upstream master is explanatory evidence, not the benchmark dependency pin.
