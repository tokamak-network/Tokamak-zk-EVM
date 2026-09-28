# Current univariate setup, proving and E2E qualification

## Audience and scope

This report is for backend performance engineers and reviewers implementing
the current univariate protocol, including subsequent prover optimization and
MPC setup work. It is separate from the superseded protocol's
prover optimization report. It covers CRS storage, trusted-setup computation
and native proof generation, with separate controls for each experiment.
The native/browser qualification and separately controlled WASM optimization
experiments below extend that evidence. Neither claims a fresh
dense-versus-omitted whole-prover speedup.
MPC implementation, publishing and CUDA measurements are outside this
experiment. The reuse guidance below identifies candidates; only changes
with explicit acceptance evidence are implemented optimizations.

For direct CPU comparisons of variable-base MSM and polynomial multiplication
and division, see the separate [primitive comparison](current-univariate-primitive-comparison.md).
Those unit measurements do not constitute an accepted production replacement
or a new whole-prover timing result.

For variable-base table reuse, see the separate
[arkworks MSM precomputation experiment](prover-arkworks-msm-reuse.md).
Its negative result is distinct from setup's successful fixed-generator
precomputation and from the later accepted signed-window prover kernel.

Reconciled against the implementation at `987474c2a` on 2026-09-12. This is
a documentation/evidence audit, not a new benchmark of that revision. Earlier
sections retain their experiment-time controls and validation scope; the
current status below supersedes their then-pending migration descriptions.

## Release-line comparison status

The previous native timing experiment compared development branches rather
than the published 2.1.5 release. It is retained below only as dated
engineering history and is not release-line evidence. Do not use its values in
release notes or for a 2.1.5 claim.

The exact 2.1.5 source and published CLI do not retain an immutable Cargo lock
or release binary. An unlocked rebuild would not identify the released native
dependency graph, so no native cross-release timing is published until a
future release preserves both artifacts.

The auditable current release-line comparison is browser WASM:
`transferNotes1To2` averaged 126.717 s for published 2.1.5 and 18.812 s for
the current candidate, a 107.905 s (85.2%) decrease or 6.74x speedup. Its raw
samples, package integrity, input and CRS digests, verifier acceptance, method,
and limits are recorded in the
[browser release-comparison evidence](../../wasm/docs/optimization/evidence/3.0.0-browser-release-comparison.json).

### Historical development-only experiment

For each revision, the same `tokamak-ch-tx` example inputs were synthesized
by that revision, producing 207 placement instances. A fresh fixed-tau
development trusted setup was then generated from that revision's local QAP
library. The explicit development provenance bypass was necessary because
these trusted-setup artifacts are not release CRS artifacts. One proof warmup
was excluded and five proof runs were performed serially; normal desktop
background activity was not controlled.

| Measurement | `origin/dev` | `feat/new-snark` | Change |
| --- | ---: | ---: | ---: |
| Trusted setup, process wall (one run) | 103.11 s | 12.29 s | 8.39x faster |
| CRS serialized payload | 783,635,785 B (0.730 GiB) | 958,006,952 B (0.892 GiB) | 22.25% larger |
| Native prove, mean of five | 11.180 s | 3.598 s | 3.11x faster |
| Native prove, standard deviation | 0.051 s | 0.019 s | — |
| Emitted native proof artifact | `proof.json`, 4,768 B | `univariate_proof.bin`, 1,184 B | 75.17% smaller |

This historical table has no release-line browser counterpart. The audited
browser comparison is the release-line evidence named above.

The proof-size row compares the actual emitted interfaces, not only abstract
proof elements: the baseline writes JSON while the new protocol writes the
common binary proof format. The CRS row is likewise a serialized-payload
comparison. The new CRS deliberately contains separately addressed tau,
prover, preprocess, and verifier key files, so its payload size is not
expected to track the former combined sigma layout one-for-one.

The new prover's historical mean instrumented total is 3.598 s. Its nested stage means
are 0.198 s for CRS loading, 0.101 s for fixture loading, 0.214 s for map
preparation, 0.521 s for selection work, 0.147 s for the copy relation, and
0.753 s for openings. These nested intervals must not be summed. The complete
commands, raw samples, artifact sizes, revisions, and interpretation limits
were recorded for the development experiment. They are not retained as
release-comparison evidence.

## Normalized public-and-bus wiring qualification — 2026-09-20

P17 replaces the retired global-wire connection layout with normalized local
coordinates. The current library uses `m=2048`, `m_b=512`, `s=256`, and
`t=64`; consequently the arithmetic and connection domains are `n*s=262144`
and `m_b*s=131072`. Public wires participate in both the arithmetic statement
and the public-and-bus copy relation. Only producer-declared capacity padding
is supplied as implicit zero and omitted from wire-specific CRS queries. A
real wire whose value happens to be zero follows the ordinary query path.

A fresh 172-placement local-QAP fixture and fresh development trusted setup
qualified this contract. Release native trusted setup, preprocess, prove, and
verify completed in sequence and verification returned `true`. The same CRS
was converted to the browser chunk contract. Chromium completed preprocess,
prove, and verify with `true`; the browser preprocess bytes equal the native
384-byte output. WASM accepted the native proof and native accepted the WASM
proof. Tampering with each proof point, each claimed evaluation, each
preprocess operand, or the public input was rejected.

| Functional sample | Elapsed time |
| --- | ---: |
| Native trusted setup, internal | 11.992173 s |
| Native trusted setup, process wall | 12.38 s |
| Native preprocess, internal | 0.257277 s |
| Native prove, internal | 3.366 s |
| Native verify, internal | 0.008045 s |
| Chromium preprocess | 2436.065 ms |
| Chromium prove | 17675.875 ms |
| Chromium verify | 26.540 ms |

The four native CRS payloads total 995,017,424 bytes (0.926682 GiB):
301,992,400 bytes of tau sequences, 677,330,704 bytes of prover keys,
15,693,216 bytes of preprocess keys, and 1,104 bytes of verifier keys. The
browser chunk representation totals 995,641,080 bytes including manifests and
chunk-level framing. These are one-run functional measurements, not an
optimization A/B comparison, cold-cache benchmark, CUDA result, MPC result,
or production-npm qualification.

The release native package sweep passed 140 library unit tests plus the
artifact, univariate-math, trusted-setup, preprocess, prove, and verifier
suites. Ten frontend selector/permutation tests and the normalized WASM
relation and preprocess checks also passed. These tests cover the canonical
`CIRCOM_CONST_ONE` cycle, public singleton identities, inactive selector
slots, rejection of unparented ordinary inputs, wire-zero admission, and the
distinction between real zero-valued wires and declared padding. Sparse-query
tests establish that declared padded slots have no stored point and therefore
perform no decode or MSM work.

[Machine-readable evidence](evidence/p17-normalized-wiring-e2e.json) records
the hashes, exact payload sizes, timings, host, fixture cardinalities, and
qualification boundaries. Earlier protocol measurements below remain
historical and are not evidence for the normalized wiring contract.

## P18 padding-work candidate triage — 2026-09-20

After compact weighted CRS rows removed globally declared padding, we assessed
the remaining padding-related compute candidates against the current
release-optimized local fixture. None met the project's material whole-path
improvement threshold, so no second image-accumulation path, sparse witness
representation, copy-recurrence branch, or sparse FFT was added.

| Candidate | Measured upper bound | Decision |
| --- | ---: | --- |
| Direct retained-target setup image accumulation | 223.49 ms / 11.47 s setup | Reject: at most 1.95%; fixed-base point encoding dominates. |
| Parse only real witness ranges | 80.97 ms / 3.57 s proof | Reject: this is the entire fixture-ingress span, not parsing alone. |
| Identity-copy recurrence compaction | 10.77 ms / 3.57 s proof | Reject: only 0.30%; dense quotient products remain required. |
| Execution-local all-zero weighted rows | at most 3.88 ms / 3.57 s proof | Reject: CPU MSM already filters zero scalar/base pairs. |

For this fixture, 127 of 1295 retained weighted rows have all-zero witness
values. They remain normal retained coordinates in the CRS; their omission is
an execution-local arithmetic choice, not a reusable-format rule. The compact
format continues to omit only producer-declared padding. The full inputs,
timings, scalar counts, and decisions are recorded in
[the P18 evidence file](evidence/p18-padding-candidates.json).

## P18 cheap-restoration CRS audit — 2026-09-20

The freshly generated compact CRS was converted into its 19 canonical point
sections and scanned record by record. It contains no point-at-infinity record,
no infinity run, and no adjacent repeated affine point. Therefore run-length
encoding cannot remove any stored point without introducing a general sparse
container.

Two larger aliases are exact: `preprocess-sc` is the `s0` prefix (12,582,912
bytes), and `preprocess-selection` is a tau-G2 range (3,096,768 bytes). They
remain duplicated by policy so a preprocess-only consumer need not download
the much larger tau sequence. The three G1 verifier handles and three tau-G2
verifier handles are also exact aliases, but their combined 864 bytes are
deliberately retained to preserve verifier-only installation.

Independent LZ4 compression of every at-most-64-MiB canonical section chunk
increased 958,005,600 point bytes by 4,151 bytes. It also makes a range ready
only after decoding the enclosing compressed chunk. LZ4 is therefore rejected;
no codec or consumer decompression path was added. The detailed scan and
timing data are in
[the cheap-restoration evidence file](evidence/p18-cheap-restoration-scan.json).

## P18 compact-CRS qualification — 2026-09-20

The compact weighted layout is qualified end to end.  The CRS stores 331,520
points in each weighted family, in canonical retained-row order, rather than
the former `m * s = 524,288` points.  Native and browser provers construct
their scalar vectors directly in that order; neither reconstructs a dense
weighted image.

Three release native CPU proof runs took 3.465 s, 3.440 s, and 3.445 s
(mean 3.450 s).  Three Chromium runs over the converted compact CRS took
17.672 s, 17.860 s, and 18.044 s for proving (mean 17.859 s); each run also
completed preprocess and verification successfully.  The direct trusted setup
release runs generated the four role archives in 11.264 s, 11.154 s, and
11.400 s.  The active four-file CRS, including provenance, is 913.627 MiB.

A fresh local-QAP synthetic two-contribution MPC fixture atomically emitted
the same four-file compact format.  Its artifact digests matched provenance,
and native preprocess -> prove -> verify on that MPC output returned `true`.
This is a development qualification only: it does not authenticate a Filecoin
source, perform a public ceremony, or publish a CRS.  The complete point
counts, timings, artifact sizes, and cross-runtime checks are in
[the P18 qualification evidence](evidence/p18-compact-qualification.json).

## WASM optimization execution results — 2026-09-13–14

### Combined six-candidate remeasurement — retained, 2026-09-14

This follow-up restores shared scalar conversion, arithmetic coset division,
multi-term linear-combination fusion, short-mask convolution, product-difference
fusion and permutation batching together on top of `5c51ef29f`. The five
previously retained W10 changes remain enabled. All six additions at
`29c3defc7` are confirmed for retention by the project owner on 2026-09-14.
The current retained set therefore contains eleven of the sixteen W10
candidates. Future optimization comparisons must include these six additions
in their control. This adoption decision supersedes their earlier individual
rejection or inconclusive disposition; it does not change the historical
measurements or establish an independent speedup for each addition.

Exactly two successful runs of the unchanged implementation preceded two runs
of the combined implementation. All four ran sequentially, with no additional
warmup runs or omitted successful samples. Both bundles are minified ES2022
browser builds using the same existing profiling hooks, Chromium 149.0.7827.55,
Apple M4 Pro and 14 runtime workers. Test processes did not overlap; the
prover's internal worker parallelism was not disabled. Each run used a fresh
browser context, runtime and reader, with digest checking off. Installation,
preprocess and verification are outside the public prove timer.

The reboot removed the former `/tmp` fixture. Preparation reused the persisted
207-placement JSON inputs, converted W4 CRS and W10 native preprocess. Archived
selector padding `0xffffffff` was represented as signed `-1`, preserving its
binary bits. Failed preparation/harness starts occurred before proving and
produced no timing samples. Both measured conditions use the same restored
fixture; this experiment does not compare a newly generated CRS with an old one.

| Public prove elapsed time | Before | Combined six |
| --- | ---: | ---: |
| Run 1 | 20950.905 ms | 20833.980 ms |
| Run 2 | 20826.125 ms | 20378.010 ms |
| Mean | 20888.515 ms | 20605.995 ms |

The observed mean reduction is **282.520 ms (1.35%)**. Both conditions pass
browser verification, native release verification and native preprocess byte
parity in both runs; all four proofs are 1184 bytes. Source and script
TypeScript checks pass. No further unit suites or timing runs were executed.

The following intervals are consecutive prove stages, averaged over the two
runs. Positive savings denote shorter elapsed time. Nested operation and worker
counters must not be added to these intervals.

| Prove stage | Before, ms | Combined six, ms | Saved, ms |
| --- | ---: | ---: | ---: |
| Connection permutation | 150.810 | 114.498 | 36.312 |
| Witness maps | 366.352 | 375.228 | -8.875 |
| Arithmetic quotient | 666.757 | 457.040 | 209.717 |
| Commit C_L / C_H | 5234.982 | 5256.635 | -21.652 |
| Bind C_O | 418.090 | 382.843 | 35.247 |
| Selection quotients | 124.672 | 128.390 | -3.718 |
| Commit D_Q / shifted D_Q | 2560.032 | 2570.112 | -10.080 |
| Commit C_D | 2584.100 | 2602.027 | -17.927 |
| Copy-product quotient | 567.157 | 504.540 | 62.618 |
| Commit C_R | 1284.730 | 1299.755 | -15.025 |
| Combine quotients | 21.207 | 14.815 | 6.392 |
| Commit C_Q | 1279.033 | 1288.407 | -9.375 |
| Opening combination | 25.083 | 13.928 | 11.155 |
| Opening pi_chi | 3953.332 | 3959.860 | -6.528 |
| Opening pi_plus | 1312.733 | 1314.525 | -1.792 |

Arithmetic, copy-product and permutation work shows lower elapsed time in the
combined implementation. The large commitment/opening spans do not show a
corresponding reduction. In particular, scalar conversion reuse does not
remove either MSM: the D_Q pair still takes approximately 2.57 seconds.
Arithmetic and copy quotient intervals also include the newly fused linear
combinations and short products, so their improvements cannot be attributed
to a single candidate from this combined experiment.

Two samples in before-before-after-after order do not establish statistical
significance, eliminate time-order/cache effects, or justify interpreting each
small negative stage delta as a regression. The combined second run is
455.970 ms faster than its first run, exceeding the 282.520 ms mean difference
between conditions. The measured improvement is therefore reported as an
observation, not a guaranteed speedup or independent acceptance of all six.

[Evidence](evidence/wasm-w10-combined-six.json) preserves all four elapsed
timings, every prove stage, operation counters, MSM calls, aggregated worker
counters, source experiment references and bundle/input hashes. The profiler
places shared scalar preparation inside the complete D_Q commitment interval
in the candidate, preserving the original stage boundary's meaning.

### W10 retained-set qualification — complete

At the original W10 completion on 2026-09-14, five changes were retained; the other eleven
candidates were rejected or inconclusive. The combined-six retention decision
above supersedes six of those historical dispositions.
W9 verifier and W8 preprocess proposals were not executed and were discarded
on 2026-09-20. W10's shared-runtime improvements remain part of the measured
prover implementation; they do not create pending work in either consumer.

The final comparison uses the preserved W10-entry control from `d2e23ef83`
and the retained implementation at `f8dc5c0fb`. Both are minified ES2022
browser bundles; generated WASM arithmetic is unchanged except for the
individually qualified kernels. Measurements use Apple M4 Pro, 14 available
workers and Chromium 149.0.7827.55, the same local-QAP 207-placement fixture,
and the same compressed CRS. Digest checking is off for both. Each invocation
has a fresh browser context, reader and runtime; this is not a cold OS-cache
test. No competing benchmark was run. One initial control/candidate warmup
pair is excluded, followed by five alternating measured pairs.

| Whole public prove call | W10-entry control | Retained W10 |
| --- | ---: | ---: |
| Mean | 22608.533 ms | 20733.702 ms |
| Median | 22627.765 ms | 20740.370 ms |
| Minimum | 22450.820 ms | 20706.830 ms |
| Maximum | 22696.400 ms | 20759.655 ms |

All five pairs improve. The mean reduction is **1874.831 ms (8.29%)**.
This is a direct retained-set comparison, not a sum of earlier improvements
measured in different sessions. All twelve invocations, including warmups,
pass browser verification, native verification and preprocess byte parity;
each proof is 1184 bytes. Initialization, preprocess and verify have separate
timers and are not included in the prove row.
[Complete samples](evidence/wasm-w10-final-comparison.json).

| Candidate | Current disposition after combined-six retention |
| --- | --- |
| W10.1 copy-boundary division/scaling | Retained |
| W10.2 copy-recurrence operands | Retained |
| W10.3a grouped MSM windows | Rejected |
| W10.3b shared scalar preparation | Retained in confirmed combined six |
| W10.3c shared base delivery | Inconclusive; removed |
| W10.4 signed-window G1 MSM | Retained |
| W10.5a arithmetic coset quotient | Retained in confirmed combined six |
| W10.5b copy coset quotient | Retained |
| W10.6a multi-term accumulation | Retained in confirmed combined six |
| W10.6b short-mask convolution | Retained in confirmed combined six |
| W10.6c pointwise product-difference fusion | Retained in confirmed combined six |
| W10.6d same-worker combination/Ruffini | Rejected at independent unit gate; no production integration |
| W10.6e permutation roots/gather | Retained in confirmed combined six |
| W10.6f placement-level sparse task batching | Inconclusive; removed |
| W10.6g selection cofactor construction | Retained; small repeated benefit |
| W10.6h bounded CRS readahead | No observed whole-prover benefit; removed |

The per-candidate sections below preserve historical experiment-time decisions,
controls, unfavorable samples, unit results and recoverable source snapshots.
The current disposition table above controls retention. Existing successful techniques are
not generalized into new caches or fallback algorithms without evidence.

#### Final detailed profile

The separate instrumented default-off invocation takes 20712.940 ms for
prove, 179.570 ms for initialization, 3352.410 ms for preprocess and
26.645 ms for verify. These are diagnostic single samples, not additional
paired timing observations. The subsequent uninstrumented explicit-on run
takes 22929.315 ms for prove and also passes browser/native verification and
preprocess parity. [Profile and explicit-on evidence](evidence/wasm-w10-final-profile.json).

| Prove stage | Elapsed ms |
| --- | ---: |
| Input admission | 3.780 |
| Domain construction | 0.035 |
| Connection permutation | 150.280 |
| Witness slots | 4.070 |
| Witness maps | 349.230 |
| Public checks and masks | 10.165 |
| Arithmetic quotient | 638.110 |
| Public polynomial | 0.620 |
| Commit C_L and C_H | 5166.680 |
| Bind C_O | 418.110 |
| Selected roots | 16.520 |
| Selection witness | 6.090 |
| Selection quotients | 120.585 |
| Commit D_Q and shifted D_Q | 2556.120 |
| First transcript update | 5.860 |
| Commit C_D | 2565.805 |
| Second transcript update | 0.340 |
| Copy-relation dispatch | 0.045 |
| Copy recurrence and operands | 92.830 |
| Copy interpolation | 118.490 |
| Copy-boundary quotient | 41.680 |
| Copy-product quotient | 552.505 |
| Commit C_R | 1272.710 |
| Combine quotients | 19.715 |
| Commit C_Q | 1268.975 |
| Evaluations | 38.760 |
| Opening combination | 26.195 |
| Opening pi_chi | 3938.575 |
| Opening pi_plus | 1328.760 |
| Final transcript update | 0.550 |
| Proof encoding | 0.710 |

Stage intervals sum to 20712.900 ms; the remaining 0.040 ms is timer/entry
overhead. Nested counters are **not additive** to this table. The cofactor
worker call is 3.465 ms, and selection accumulation is 116.995 ms. Prove's
31 G1 MSM API calls total 17377.690 ms including delivery and reduction;
1494 window tasks transfer 7541218600 input bytes and 215136 output bytes.
Their summed worker kernel time is 172497.675 ms because workers overlap;
it is not elapsed prove time. Contiguous CRS-read counters total 890.960 ms,
already inside the stage intervals. Transfer totals are not peak resident
memory measurements; no new process-RSS peak is claimed here.

#### Correctness and remaining unrelated limitation

Using the existing CRS, native release preprocess -> prove -> verify passes
again with `true`; the native preprocess bytes match the reference. The new
native proof passes WASM verification, and a newly generated WASM proof passes
both verifiers. Independent native-oracle fixtures `n2`, `n8` and `singleton`
match all proof bytes with test-only masks. All six challenge rounds and root
orientation match the shared fixture. Tests reject changes to all ten proof
points, seven evaluations, three preprocess operands and the public input,
as well as malformed encodings. Digest-off/on and malformed CRS regression
checks pass. No setup regeneration, real MPC, publication or CUDA measurement
was performed. [Qualification record](evidence/wasm-w10-final-qualification.json).

The optimization suite now includes signed MSM, copy coset and cofactor
regressions. Direct production TypeScript checking, script/test TypeScript
checking, contract closure, polynomial/relation/preprocess, binary conversion,
field-operation and ownership checks pass. The broader
`npm run typecheck:development` still fails in the **pre-existing unrelated**
generator test fixture: `m_D=48`, `m=8`, `s_D=1` violates `m_D=m*s_D`.
That fixture and validation code are unchanged since the W10 baseline. This
scoped qualification is not a claim that the aggregate development check or
the package release gate is clean; repairing that fixture is outside W10.

### W10.6h bounded requested-range CRS readahead — not retained

The candidate starts the next requested chunk while awaiting the current
chunk, in both contiguous and strided reads. It does not speculate outside
the requested range. The existing two-entry cache holds raw read promises;
length/digest checks run when a chunk is consumed. Unconsumed prefetch
failures have a rejection observer, but the original rejected promise is
retained and its error reaches any later consumer. The loader interface,
structural admission and off-by-default digest policy are unchanged.

Independent tests cover ordering, range boundaries, empty reads, invalid
shapes, default/on digest counts, consumed/unconsumed errors and a maximum
of two simultaneous loads for a sequential range read. Eight synthetic
loads with an explicit 3-ms delay average 27.533 / 13.787 ms over five pairs.
This verifies overlap, not actual browser network speed; both paths load
the same eight chunks. [Unit samples](evidence/wasm-w10-crs-readahead-unit.json).
Three native proof-byte oracles and all twelve browser/native E2E runs pass.
After the excluded warmup pair, five measured pairs average 20817.779 /
20820.122 ms (0.01% slower), with medians 20772.245 / 20817.140 ms and
ranges 20718.055--21007.560 / 20794.560--20851.550 ms. Three pairs regress.
There is no observed whole-prover benefit under the actual fixture loader;
the synthetic overlap result does not justify retaining extra reader/cache
logic. Restore the original reader. This is not a claim that readahead never
helps other network environments. The candidate and isolated test remain
recoverable at `c318baece`. [Browser samples](evidence/wasm-w10-crs-readahead.json).

### W10.6g worker cofactor construction — accepted

The candidate groups selected roots across the existing worker concurrency.
Each task reuses the existing Ruffini and scale kernels and returns the same
row-major cofactor buffer. The selection polynomial is copied once per task;
no new arithmetic kernel, worker pool or persistent cache is introduced.
Five isolated construction pairs at 256 roots average 38.454 / 2.804 ms,
including packing, dispatch and retrieval. Scalar-polynomial equality covers
singleton/inactive roots, row order, empty/sparse witnesses and malformed
shapes. [Unit samples](evidence/wasm-w10-selection-cofactors-unit.json).
Existing selection tests and three native proof-byte oracles pass. All 24
browser invocations pass native/browser verification and preprocess parity.
Each session excludes its first warmup pair. The first five pairs average
20252.213 / 19934.894 ms (1.57% faster), medians 20001.545 / 19946.660 ms,
ranges 19969.565--20787.265 / 19864.675--19972.695 ms; all five improve.
The reversed repeat averages 19965.986 / 19938.713 ms (0.14% faster),
medians 19957.890 / 19939.470 ms, ranges 19945.885--19990.420 /
19901.360--19982.360 ms; four of five improve. Nine of ten pairs improve;
the median paired saving across both sessions is 48.572 ms. Both session
means and medians improve, but the first mean is inflated by control drift:
do not present 1.57% as the expected cofactor gain. Retain this small, repeated
improvement, not a promise of a fixed wall-time reduction.
[First samples](evidence/wasm-w10-selection-cofactors.json),
[repeat samples](evidence/wasm-w10-selection-cofactors-repeat.json).
At 256 roots the result is the same 2-MiB matrix; each worker task gets one
8224-byte polynomial plus its root/scalar commands and reuses an 8192-byte
quotient scratch row. No long-lived cofactor cache is added. Candidate source
is `65a9daa93`; the next control bundle is preserved in ignored
`wasm/tmp/optimization-w10-selection-cofactors/control.js`.

### W10.6f placement-level sparse task batching — inconclusive, not retained

The candidate sends one placement's A/B/C row-dot operations to one existing
worker task, retaining order and three separate outputs. Gathering and
scattering keep the existing placement/wire coordinates. Single and batched
calls share the previous command construction and shape checks, without
changing sparse arithmetic, repacking CSR matrices or adding a worker pool.
Independent sequential/scalar equality covers empty/unequal row counts and
malformed buffers; the existing relation suite also passes.

Five unit pairs over 207 synthetic placements, with A/B/C row counts
1024/512/1024, average 88.729 ms control versus 81.626 ms candidate. Packing,
dispatch and output retrieval are included; common witness gather/scatter is
outside this primitive comparison. [Unit samples](evidence/wasm-w10-sparse-placement-unit.json).
Three native-oracle fixtures match all proof bytes. All 24 browser E2E runs
pass native/browser verification and preprocess parity. Each session excludes
its first warmup pair. The first five measured pairs average 21013.655 /
20907.098 ms (0.51% faster); medians are 21029.730 / 20835.305 ms and ranges
20920.070--21047.765 / 20728.765--21115.920 ms. Three pairs improve.
The reversed session averages 21011.321 / 21023.411 ms (0.06% slower);
medians are 21092.630 / 21101.585 ms and ranges 20754.495--21130.320 /
20801.980--21262.970 ms. Three pairs improve. This does not establish a
repeatable whole-prover gain. The production candidate and isolated test
are removed and recoverable at `3f77a1c3c`.
[First samples](evidence/wasm-w10-sparse-placement.json),
[repeat samples](evidence/wasm-w10-sparse-placement-repeat.json).

### W10.6e batched permutation roots and gather — inconclusive, not retained

All coordinate, duplicate-source/target and inactive-slot admission remains.
The candidate fills an all-one buffer by doubling byte copies, uses the
existing worker-backed geometric-key API to construct domain powers, and
gathers values by the already checked target indices. It avoids per-element
JS field multiplication and repeated target exponentiation. No new field
kernel, worker pool or input format is introduced.

Five independent construction pairs at 262144 elements and 32768 explicit
mappings average 110.163 ms versus 13.780 ms. Both exclude unchanged admission
and IFFT; real helper output and coefficients are checked separately. Tests
include singleton, identity and inactive slots and malformed permutation
rejection. [Unit samples](evidence/wasm-w10-permutation-unit.json).
The synthetic mapping distribution is not the application fixture. The first
five browser pairs average 20905.655 / 20912.369 ms (0.03% slower); four pairs
improve but one loses 462.810 ms. Medians are 20853.310 / 20780.310 ms, ranges
20792.795--21115.020 / 20733.620--21314.965 ms. All twelve invocations,
including the excluded warmup pair, pass native/browser verification and
preprocess parity. Existing relation tests and three native-oracle proof-byte
comparisons also pass. [First samples](evidence/wasm-w10-permutation.json).
The reversed-order repeat averages 20985.083 / 20973.695 ms (0.05% faster),
but medians are 20921.745 / 20959.975 ms. Ranges are
20768.370--21292.845 / 20797.435--21156.795 ms; only two of five pairs improve.
Across ten pairs six improve, and the combined mean saving is 2.337 ms.
This does not establish a repeatable whole-prover gain. All 24 E2E invocations
pass. [Repeat samples](evidence/wasm-w10-permutation-repeat.json).
The candidate and isolated test are preserved at `c3358279f` and removed
from the retained implementation. The unfavorable samples are not excluded.

### W10.6d same-worker combination plus Ruffini — rejected at unit gate

The test-only candidate accumulates the combination in the same worker that
performs Ruffini, eliminating the intermediate return/copy. It reuses existing
field kernels and treats constants explicitly. Quotient and remainder match
the accepted control for constants, empty/zero terms, cancellation and unequal
lengths. The retained test is an experiment, not a public runtime option.

At 262144 coefficients, five paired means are 34.555 / 63.737 ms for two
terms and 43.745 / 83.339 ms for four terms. Every candidate loses. Keeping
the whole accumulation on one worker removes the parallel range processing
used by the control; the saved transfer does not offset that work in this
experiment. [Raw unit samples](evidence/wasm-w10-combination-ruffini-unit.json).
The candidate fails the independent performance gate and is not integrated
into the prover. No candidate E2E or whole-prover speedup is claimed. This
does not authorize a new parallel prefix algorithm or an additional worker
pool; those are not part of this experiment.

### W10.6c pointwise product-difference fusion — rejected

One existing-worker range task computes A*B-C*D with two field multiplications
and one subtraction per element, without exporting intermediate products.
Only the two copy-coset numerator evaluations use it; exact original-domain
zero checks and all mask terms remain. Five isolated pairs average 11.178 ms
control versus 8.747 ms candidate at 262144 elements, including copies and
assembly; both slow first-pair values are retained.
[Unit samples](evidence/wasm-w10-product-difference-unit.json).
Empty/uneven buffers, cancellation, zero inputs and malformed-buffer rejection
pass. Copy-coset boundary tests and three exact native-oracle proof comparisons
also pass. Five alternating browser pairs average 19975.303 ms control versus
19984.364 ms candidate (0.05% slower); four pairs regress. Medians are
19968.060 / 19989.395 ms, ranges 19952.070--20006.330 /
19935.800--20045.340 ms. All twelve invocations, including the excluded
warmup pair, pass native/browser verification and preprocess parity.
[Browser samples](evidence/wasm-w10-product-difference.json).
No whole-prover benefit is established. The candidate, retained at snapshot
`e7c59c46d`, was removed together with its isolated test. This rejects the
integration, not the algebraic equivalence or the observed small unit saving.

### W10.6b short-mask convolution — inconclusive, not retained

A narrow WASM kernel computes one output range and its short left halo in one
task, replacing separately padded add-scaled passes for masks of at most four
coefficients. Existing small direct products and general FFT products are
unchanged. Worker count follows the runtime; every output is explicitly
initialized, and boundary halos contain algebraic zeros rather than omitted
mask terms. Independent equality includes both operand orders, widths 1--4,
N=1 through 262144, uneven shards and sparse/zero masks.

Five unit pairs average 10.831 / 7.917 ms for two coefficients and
17.370 / 12.626 ms for four coefficients, including packing, dispatch and
assembly. The slow two-coefficient pair is retained.
[Unit samples](evidence/wasm-w10-short-convolution-unit.json).
The first five-pair browser session averages 19981.440 / 19930.796 ms (0.25%);
medians are 19972.050 / 19904.215 ms and ranges 19898.065--20087.755 /
19864.910--19993.110 ms. Four pairs improve; one regresses. All twelve E2E
invocations, including the excluded warmup pair, pass native/browser
verification and preprocess byte parity. [First samples](evidence/wasm-w10-short-convolution.json).
The reversed-order repeat averages 19960.583 / 19945.065 ms (0.08%), with
medians 19966.180 / 19929.485 ms and ranges 19907.030--20015.035 /
19919.755--19978.950 ms. Three of five pairs improve. Seven of ten paired
improvements and a combined mean saving of only 33.081 ms do not demonstrate
a repeatable whole-prover benefit beyond the observed variation. All 24 E2E
invocations and three deterministic native-oracle proof comparisons pass.
[Repeat samples](evidence/wasm-w10-short-convolution-repeat.json).
The candidate snapshot is `64200da0c`. Its kernel, runtime method and isolated
test were removed; the prior short-product implementation is retained.

### W10.6 entry profile and local fusion experiments

The accepted-copy-coset profile passes browser/native verification and
preprocess parity: instrumented prove 21108.795 ms; a separate uninstrumented
explicit-on digest invocation takes 23389.265 ms and also passes. These are
diagnostics, not a paired speedup claim. [Full profile](evidence/wasm-w10-copy-coset-profile.json).

| Stage | Instrumented elapsed (ms) |
| --- | ---: |
| Permutation | 152.770 |
| Witness maps | 367.880 |
| Arithmetic quotient | 668.530 |
| C_L/C_H | 5231.605 |
| C_O binding | 391.110 |
| Selected roots / selection quotients | 17.090 / 175.340 |
| D_Q/D_Q,K | 2580.255 |
| C_D | 2612.695 |
| Copy recurrence / interpolation | 91.510 / 121.425 |
| Copy boundary qC0 / product qC1 | 41.300 / 579.745 |
| C_R / C_Q | 1295.395 / 1302.695 |
| Evaluations | 39.090 |
| Opening combination | 27.375 |
| pi_chi / pi_plus | 4022.575 / 1334.755 |

Other input/transcript/output intervals are in the raw profile. Nested API
durations and concurrent worker durations must not be added to these stages.
This is the control checkpoint for the subsequent independent W10.6 candidates.

**W10.6a multi-term worker accumulation — inconclusive, not retained.** Keep each
range's accumulator in one existing-worker task while invoking the existing
add-scaled kernel for each term. Short terms touch only their actual prefix;
no whole-polynomial padding or intermediate round trip is necessary. No new
worker pool, field arithmetic or public artifact contract is introduced.
Independent tests match the prior batched and small scalar controls, including
empty/zero terms, cancellation, unequal lengths and malformed buffers.
Five 262144-element four-term pairs average 20.075 ms versus 9.674 ms including
task construction/copies and result assembly. [Unit samples](evidence/wasm-w10-linear-combination-unit.json).
The first five-pair browser session averages 20937.747 ms control versus
20773.569 ms candidate (0.78%); medians are 20838.395 / 20735.970 ms,
ranges 20756.960--21237.175 / 20674.430--21004.065 ms. All five pairs improve;
the smallest saving is only 20.990 ms. All twelve invocations, including the
excluded warmup pair, pass native/browser verification and preprocess parity.
[First browser samples](evidence/wasm-w10-linear-combination.json).
The reversed-schedule repeat averages 20288.103 / 20231.913 ms (0.28%),
but medians are 19984.280 / 20038.095 ms. Ranges are
19953.770--20775.870 / 19899.610--20991.810 ms; three of five pairs improve.
Across ten pairs the mean saving is 110.184 ms, sample standard deviation
294.763 ms; a descriptive paired-t 95% interval spans -100.662 to 321.030 ms.
Eight pairs improve, but the second session's worse median and mixed large
differences do not establish a sufficiently repeatable whole-prover gain.
Both sessions' means also drift, indicating uncontrolled desktop variation.
All 24 invocations pass native/browser verification and preprocess parity.
[Repeat samples](evidence/wasm-w10-linear-combination-repeat.json).
The candidate and isolated test are recoverable at `09b6f954d`; the additional
runtime method and integration were removed. No unqualified fusion remains.

### W10.5b copy coset quotient — accepted

The candidate uses the recurrence's existing numerator, denominator and R
evaluations for the original-domain zero check. The unmasked quotient degree
is below N; it is recovered from a disjoint N-point coset instead of the
previous 2N-point product and exact division. R(omega X) is a one-slot rotation
on the coset. F/G degree-N coefficients are folded using the constant coset
value of X^N, including N=1. Short-mask terms, denominator rejection and cycle
closure remain unchanged. All transforms use the existing worker runtime;
there is no additional FFT pool or public artifact change.

Independent tests compare exact coefficients against the accepted W10.4
mask-separated control at N=1,2,8,64,262144, with zero/nonzero masks, zero
polynomials, degree-N terms, leading zeros and invalid-relation rejection.
Five unit pairs average 773.098 ms control versus 491.566 ms candidate;
the interval includes validation, buffers, transforms and mask expansion.
[Unit samples](evidence/wasm-w10-copy-coset-unit.json).
The existing masked-quotient/recurrence suites pass, and n2, n8 and singleton
native-oracle fixtures produce identical proof bytes and verify successfully.
The first five alternating browser pairs reduce mean prove time from
21267.697 to 20912.620 ms (1.67%); all five improve. Medians are 21200.700
and 20866.950 ms, ranges 21098.980--21485.630 and 20749.755--21131.930 ms.
All twelve invocations, including the excluded warmup pair, pass native/browser
verification and preprocess byte parity. [First browser samples](evidence/wasm-w10-copy-coset.json).
A reversed-schedule repeat averages 21277.003 versus 20947.550 ms (1.55%);
medians are 21308.775 / 21022.685 ms, ranges 21025.165--21499.085 /
20739.315--21109.805 ms. All five pairs improve, although the last saving is
only 2.480 ms. Across both sessions ten of ten pairs improve; all 24 E2E
invocations pass. [Repeat samples](evidence/wasm-w10-copy-coset-repeat.json).
The copy candidate is retained independently of the rejected arithmetic
candidate. A subsequent isolated test extends degree-N coverage to F as well
as G; all exact coefficient and rejection assertions pass.

### W10.5a arithmetic coset quotient — inconclusive, not retained

This candidate checks `UV-W=0` on the existing witness interpolation domain,
then evaluates the unmasked numerator on a disjoint N-point coset. Since its
degree is at most 2N-2, an exact quotient has degree below N. One inverse
transform plus geometric scaling recovers it. The accepted short-mask cross
terms are unchanged. Evaluation/coefficient pairs come from the same internal
witness-map interpolation; no new artifact or public input contract is added.

The prior mask-separated product/exact-division path is the control, not the
older fully masked product. Independent N=1,2,8,64,262144 tests check exact
coefficients, zero/nonzero masks, leading zeros and non-divisible rejection.
Five unit pairs, including transforms, validation and buffers, average
579.865 ms control versus 433.135 ms candidate. Three existing deterministic
native-oracle fixtures also match proof bytes and verify successfully.
[Unit samples](evidence/wasm-w10-arithmetic-coset-unit.json).

Two fresh-context browser sessions preserve the accepted W10.4 bundle as
control. Each excludes one warmup pair and measures five alternating pairs;
the second reverses the order. All 24 invocations pass native/browser
verification and native preprocess byte parity.

| Session | Control mean / median (ms) | Coset mean / median (ms) | Improved pairs |
| --- | ---: | ---: | ---: |
| First | 21380.974 / 21423.960 | 21330.680 / 21330.535 | 3/5 |
| Reversed schedule | 21766.469 / 21821.155 | 21403.138 / 21302.050 | 4/5 |
| Third | 21415.918 / 21427.260 | 21320.123 / 21163.010 | 3/5 |

The mean differences are 0.24%, 1.67% and 0.45%; these are small relative to
observed desktop variation. Across fifteen pairs, mean savings are 169.807 ms
with a 373.841 ms sample standard deviation. A descriptive paired Student-t
95% interval is -37.240 to 376.854 ms; uncontrolled desktop samples are not
assumed independent enough to treat this interval as a formal guarantee.
Ten of fifteen pairs improve. This is insufficiently reproducible to retain
the extra coset representation/validation path in production. The candidate
and its isolated test are recoverable at `867343c13`; both were removed after
qualification. This does not reject the mathematics or its isolated gain.
All outliers remain in the [first samples](evidence/wasm-w10-arithmetic-coset.json)
and [repeat samples](evidence/wasm-w10-arithmetic-coset-repeat.json), plus
[third-session samples](evidence/wasm-w10-arithmetic-coset-third.json).
All 36 invocations pass native/browser verification and preprocess parity.
No copy-coset or later fusion candidate is included in these measurements.

### W10.4 signed-window G1 MSM — accepted, 2026-09-14

The native signed-digit/half-range-bucket idea now uses existing WASM G1
mixed-add, mixed-subtract and projective-add primitives. Scalars are recoded
once per point chunk; each existing worker processes one signed window.
Nonfinal digits use half-range buckets. The final window retains its carry
and allocates its required unsigned range. Identity-safe reduction, separate
commitments and the existing point-chunk upper bound remain. W10.3's rejected
grouped-window and paired-commitment schedules are not included.

The input-size width rule is the native rule: width 3 below 32 points,
otherwise floor(ceil(log2(point count)) * 69 / 100) + 1. Independent neighboring
widths were tested, not assumed optimal from native performance. Repeat unit
means, including recoding, allocation, copying and reduction, are:

| Points | Width | Stock unsigned (ms) | Signed (ms) |
| --- | ---: | ---: | ---: |
| 4097 | 8 | 16.246 | 14.983 |
| 4097 | 9 | 16.313 | 14.267 |
| 4097 | 10 | 18.056 | 15.299 |
| 262144 | 12 | 698.490 | 659.997 |
| 262144 | 13 | 702.705 | 655.462 |
| 262144 | 14 | 712.966 | 660.750 |

These use a known small base pool, not the browser CRS distribution. Five
pairs per width follow equality/warmup calls. Both the first measurements and
the repeat, including slower/outlying samples, remain available:
[first unit evidence](evidence/wasm-w10-signed-unit.json),
[repeat unit evidence](evidence/wasm-w10-signed-unit-repeat.json).
The tested rule is retained, not claimed globally optimal for every input or
device. No worker count is fixed in production.

Two minified-browser sessions compare accepted W10.2 with signed MSM. Each
excludes one warmup pair and measures five pairs in fresh contexts; the
second reverses the alternating order schedule. Chromium 149, 14 available
workers, compressed local-QAP inputs and default-off digest mode are unchanged.

| Session | Control mean / median (ms) | Signed mean / median (ms) | Improved pairs |
| --- | ---: | ---: | ---: |
| First | 22888.146 / 22801.075 | 22589.593 / 22122.100 | 3/5 |
| Reversed schedule | 22315.610 / 22343.850 | 21267.051 / 21229.850 | 5/5 |

Control/signed ranges are 22536.525--23204.655 / 21547.440--24078.480 ms
and 22165.440--22461.560 / 21206.900--21431.070 ms. Session means improve by
1.30% and 4.70%, with eight of ten paired improvements. The two slower first-
session candidates are not excluded; these measurements are not a guarantee
of a device-independent speedup. [First samples](evidence/wasm-w10-signed.json),
[repeat samples](evidence/wasm-w10-signed-repeat.json).

All 24 runs, including excluded warmups, pass browser/native verification and
native preprocess-byte parity. Independent tests check exact integer digit
reconstruction through 256-bit boundaries, maximum-value carry, zero/one/r-1
and full-width scalars, identity/duplicate/negative bases, cancellation,
point-count boundaries and external chunk assembly. Complete deterministic
proof bytes also match the existing native scalar oracle for n2, n8 and
singleton fixtures; all three verify true. Direct TypeScript checking passes.
An initial development-only command-array encoding bug was fixed before any
recorded unit timings or production-entry E2E execution.

At 262144 points and width 13, signed digit scratch is 20 MiB plus an 8-MiB
padded scalar copy. Logical per-window inputs total 500 MiB versus stock's
608 MiB, while nonfinal buckets fall from 16384 to 4096 points. These are
buffer/payload counts, not measured peak memory. Timing includes all of these
costs. No persistent table cache, new worker pool or CRS format change is added.
The discarded W9/W8 proposals would have used this shared G1 runtime as their
control; no such follow-up is planned.

A separate closure profile records 21208.000 ms prove, 17543.765 ms inclusive
across 31 G1 MSM calls, 1494 window tasks, 7541218600 logical input bytes and
215136 output bytes. Worker kernel work sums to 174282.930 ms and overlaps
across workers; it is not elapsed proving time. Main-thread MSM reduction
sums to 21.765 ms. Explicit-on digest execution separately records 23548.370 ms
prove. Both pass browser/native verification and preprocess parity. These
single diagnostic/on runs are not new paired speedup estimates.
[Closure profile and on-mode evidence](evidence/wasm-w10-signed-profile.json).

### W10.3c shared C_L/C_H base delivery — inconclusive, not retained

Two independent stock unsigned MSM kernels received one base buffer and two
scalar buffers per window task. C_L/C_H results and transcript positions were
unchanged. Unequal polynomial lengths were padded with zero coefficients;
CRS ranges were read once through the same admitted reader. Independent tests
cover separate-output equality, full-width scalars, identities/negative bases,
empty/unequal vectors, chunk tails and malformed bounds.

For a 262144-point pair, 19-window logical input delivery falls from 1216 to
760 MiB; outputs are unchanged. This is a payload calculation, not peak RSS.
The isolated Node pair averages 1784.049 ms control versus 1812.844 ms candidate,
including one slow candidate sample. [Unit evidence](evidence/wasm-w10-shared-bases-unit.json).

Two minified-browser sessions each exclude one warmup pair, then measure five
fresh-context pairs with opposite alternating order schedules. The control is
W10.2; Chromium 149, 14 available workers, default-off digest policy and the
same compressed local-QAP inputs are unchanged.

| Session | Control mean / median (ms) | Candidate mean / median (ms) | Improved pairs |
| --- | ---: | ---: | ---: |
| First | 22963.621 / 22819.700 | 22845.297 / 22852.270 | 1/5 |
| Reversed schedule | 22863.478 / 22864.055 | 22811.787 / 22868.660 | 3/5 |

Control/candidate ranges are 22410.255--24135.655 / 22526.825--23122.580 ms
and 22691.945--22996.570 / 22697.345--22925.515 ms. Mean reductions of 0.52%
and 0.23% do not establish a consistent gain: only four of ten pairs improve,
and the candidate median is higher in both sessions. All 24 runs pass native
and browser verification and native preprocess-byte parity. Allocation, reads
and worker copying are included; peak memory is not sampled.
[First samples](evidence/wasm-w10-shared-bases.json),
[repeat samples](evidence/wasm-w10-shared-bases-repeat.json).

The experimental implementation and unit test are reproducible at commit
`5365363b3`, then removed from the retained code. W10.3 is complete with no
MSM-sharing production changes. W10.4 evaluates signed-window arithmetic
separately; none of these inconclusive schedules is assumed beneficial there.

### W10.3b shared selection-scalar conversion — inconclusive, not retained

The candidate converts each D_Q/D_Q,K coefficient chunk out of Montgomery
representation once and reuses it for two separate stock MSMs. It changes no
worker kernel or transcript point. Separate-output equality, zero/empty
vectors, chunk tails and malformed capacities pass. Isolated conversion time
falls from 5.564 to 2.492 ms for 262144 scalars (five pairs, excluded warmups,
equality assertions outside timing). [Unit evidence](evidence/wasm-w10-shared-scalars-unit.json).

Two minified-browser sessions each exclude one warmup pair and measure five
pairs, reversing the alternating pair-order schedule in the second session.
The control remains W10.2, with default-off digests, Chromium 149 and 14
available workers.

| Session | Control mean / median (ms) | Candidate mean / median (ms) | Improved pairs |
| --- | ---: | ---: | ---: |
| First | 22879.058 / 22722.680 | 22741.285 / 22737.245 | 2/5 |
| Reversed schedule | 22869.288 / 22754.610 | 22529.464 / 22521.890 | 4/5 |

Control/candidate ranges are 22320.010--23610.460 / 22393.780--22962.930 ms
and 22364.515--23767.380 / 22322.130--22694.525 ms. Means improve by 0.60%
and 1.49%, but paired differences range from a 356.780-ms regression to a
1072.855-ms improvement; only six of ten pairs improve. The additional session
does not establish a consistent whole-prover gain from this small operation.
This is inconclusive, not proof of no possible benefit and not an accepted
optimization. All 24 runs pass browser/native verification and native
preprocess-byte parity. Allocation and transfer are included; peak memory is
not measured. [First samples](evidence/wasm-w10-shared-scalars.json),
[repeat samples](evidence/wasm-w10-shared-scalars-repeat.json).

The candidate and dedicated unit test are preserved at commit `2335cd7c3` for
reproduction, then removed from the retained implementation. No shared-scalar
production helper remains. Existing W10.1/W10.2 optimizations are unchanged.

### W10.3a grouped MSM windows — rejected, 2026-09-14

The candidate retains ffjavascript's unsigned bucket kernel and width table,
but delivers several windows per worker task. Groups follow available
concurrency; buffers are invocation-local. For 262144 points, 19 windows become
14 tasks on this host, reducing repeated logical input delivery from 608 to
448 MiB per MSM. This is a task-payload calculation, not peak memory. Tiny
tail MSMs also submit fewer tasks. Each task still executes its windows in
sequence, which changes load balancing.

Independent stock-MSM and known-generator-sum comparisons pass for full-width
scalars, identities, duplicated/negated bases, zero/one/r-1 scalars, uneven
window groups and point-count boundaries. In the small-base-pool Node test,
five paired 262144-point calls average 718.124 ms control versus 734.274 ms
candidate. The unit distribution is not the CRS distribution.
[Unit evidence](evidence/wasm-w10-grouped-unit.json).

Five fresh-context browser pairs with alternating pair order, after one
excluded warmup pair, average 22838.973 ms control versus 23014.925 ms
candidate (0.77% slower). Medians are 22677.655 / 22922.995 ms; ranges are
22352.090--23353.860 / 22813.425--23574.205 ms. Four of five pairs regress.
All twelve runs pass browser/native verification and preprocess byte parity.
The control is accepted W10.2; digest mode is off, Chromium is 149, available
workers are 14. Copies, allocation and reduction are included; peak memory
was not measured. [Browser evidence](evidence/wasm-w10-grouped.json).

No grouped-window production path is retained. The candidate and its equality
test remain under `wasm/test` for reproducibility. With the preserved W10.2
control bundle and the profiling runner at commit `ef38a70a8`, set
`BACKEND_WASM_PROFILE_CANDIDATE=grouped-msm` to build the experimental bundle.
This result rejects this grouping schedule, not every possible MSM-sharing
technique. Shared D_Q/D_Q,K preparation and C_L/C_H base delivery remain
separate experiments.

### W10.2 batched copy operands — accepted, 2026-09-14

The independent numerator/denominator loop now runs inside existing WASM
workers. Each range starts at beta times the appropriate root power; batch
inversion, ordered recurrence, zero-denominator rejection and cycle closure
are unchanged. Unit tests compare complete vectors to the previous operand
loop and small scalar recurrence oracle, including uneven ranges, N=1,
zero/negative challenges and invalid denominators at multiple positions.
Masked quotient regression and direct TypeScript checking also pass.

[Unit evidence](evidence/wasm-w10-recurrence-unit.json) measures the complete
recurrence against the **previous batched-inverse/recurrence implementation**,
not an obsolete per-element division algorithm: five pairs after warmup give
402.530 ms control versus 82.792 ms candidate. Extra worker input/output copies
and final assembly are included. Two O(N) output buffers remain; no new pool,
persistent cache or fixed worker count is introduced. Peak memory was not
sampled.

Minified-browser comparisons use W10.1 as control, Chromium 149, 14 available
workers, the same compressed local-QAP fixture and default-off digests. Each
session excludes the first pair, then measures five pairs in fresh contexts.

| Order | Control mean (ms) | Candidate mean (ms) | Control median (ms) | Candidate median (ms) |
| --- | ---: | ---: | ---: | ---: |
| Control first | 23060.367 | 22653.091 | 22649.090 | 22723.940 |
| Candidate first | 22903.286 | 22572.758 | 22851.355 | 22533.850 |

Forward control/candidate ranges are 22585.465--24276.675 /
22321.060--23023.985 ms; reverse ranges are 22789.215--23164.805 /
22438.375--22812.575 ms. Nine of ten pairs improve; the forward 255.110-ms
regression remains in the data. Mean reductions are 1.77% and 1.44%; this is
a small whole-prover improvement, not the unit-operation speedup. All 24 runs,
including four excluded warmups, pass browser/native verification and native
preprocess-byte parity with 1184-byte proofs.
[Forward samples](evidence/wasm-w10-recurrence.json),
[reverse samples](evidence/wasm-w10-recurrence-reverse.json).

### W10.1 batched copy boundary — accepted, 2026-09-14

The remaining scalar Ruffini and scale calls now use the existing buffer APIs.
The R_hat(1)=1 check is unchanged. Independent tests cover N=1/2/8/64,
constant and masked/nonconstant valid polynomials, invalid boundaries and
262144-coefficient exact equality to the scalar cancellation implementation.
[Unit samples](evidence/wasm-w10-boundary-unit.json) include both preparation
and worker delivery: five pairs after excluded warmups measured about
150.315 ms scalar versus 32.690 ms batched. Direct TypeScript checking passed.

The minified browser experiment uses the preserved W10.0 control and unchanged
compressed CRS, local-QAP inputs and default-off digest mode. Each session
excludes its first control/candidate pair as warmup. Reverse execution order
was added because the first session showed a decreasing runtime trend.

| Session, five measured pairs | Control mean (ms) | Candidate mean (ms) | Control median (ms) | Candidate median (ms) |
| --- | ---: | ---: | ---: | ---: |
| Control first | 22479.951 | 22105.540 | 22503.860 | 22294.950 |
| Candidate first | 23381.306 | 23039.373 | 23291.190 | 23000.685 |

Control/candidate ranges were 21711.220--23353.695 / 21532.425--22543.775 ms
in the first session and 22996.500--23844.895 / 22833.575--23372.845 ms in
the reverse session. Nine of ten measured pairs improved; one regressed by
81.655 ms and is retained in the evidence. Session mean reductions are 1.67%
and 1.46%, not a hardware-independent forecast or the unit-operation ratio.
All 24 runs, including four excluded warmups, returned true, matched native
preprocess bytes and passed release-native verification with 1184-byte proofs.
[Forward raw samples](evidence/wasm-w10-boundary.json),
[reverse raw samples](evidence/wasm-w10-boundary-reverse.json).

This small production change is accepted. It adds worker input/output copies
for the quotient rather than avoiding all memory traffic; no cache or new
worker pool was added. Peak memory was not sampled. The existing boundary
coefficient buffers remain O(N); allocation/transfer cost is inside both unit
and full-call measurements. W10.2 uses this accepted version as its control.

### W10.0 control and MSM diagnostics — 2026-09-14

At the time, W10 was followed by W9 and W8. Those two proposals were later
discarded without implementation. W10.0 reused the existing W4 compressed
fixture and minified browser control, without changing production arithmetic.
Chromium 149 and 14 workers completed the following fresh-context samples; all
returned true, matched native preprocess bytes, and passed the release native
verifier. Direct TypeScript checking passed.

| Mode | Preprocess (ms) | Prove (ms) | Verify (ms) |
| --- | ---: | ---: | ---: |
| Default off, uninstrumented | 3370.770 | 22941.005 | 28.615 |
| Explicit on, uninstrumented | 3616.965 | 25683.535 | 28.025 |
| Default off, full worker diagnostic | 3543.230 | 23957.365 | 27.360 |

[Initial samples](evidence/wasm-w10-baseline.json) include a preliminary
23367.850-ms profile whose worker instrumentation did not reach the browser
dependency bundle. It is E2E evidence only, not complete worker timing.
[The completed diagnostic](evidence/wasm-w10-msm-profile.json) instruments the
actual bundled worker source without modifying installed dependency files.
These are single controls/diagnostics, not paired optimization results. A
separate preserved uninstrumented bundle is used for candidate comparisons.

The complete profile records 31 prove MSM calls taking 19618.065 ms inclusive,
3530 window tasks, 9161142016 input bytes summed over tasks, and 508320 output
bytes. The separate per-task sums are 53267.410 ms waiting for dispatch,
1961.295 ms worker allocation/input copying, 190977.515 ms bucket kernel work,
and 106.840 ms output copying. These are overlapping worker-work sums, not
elapsed proving time and not measurements of peak memory. Queue-to-result
intervals also include message transport and must not be interpreted as pure
transfer time. Main-thread reduction takes 25.960 ms across all profiled G1
MSMs, including preprocess. Tiny tail MSMs generate many single-bit tasks;
task count alone does not establish where most arithmetic time is spent.

W10.0 is complete. W10.1 onward must pass independent tests and paired
whole-prover measurements before acceptance; no speedup is claimed here.

W0--W7 are complete at the individual gates below. The final regression run
passed direct `tsc --noEmit`, `univariate:optimization:check`, current CRS
admission/digest tests, offline compressed-CRS conversion tests and the
existing univariate polynomial suite. `univariate:optimization:check` is the
reproducible regression entry point for the new coefficient/group tests; its
unit timings are diagnostic, not replacements for the recorded browser pairs.
The unrelated aggregate development-typecheck fixture failure documented in
W0 remains outside this optimization change.

### Final closure and timing summary

The final minified ES2022 build completed three additional fresh-context E2E
runs on Chromium 149.0.7827.55, with 14 reported logical CPUs/runtime workers.
The existing local-QAP 207-placement fixture and W4's logically identical
compressed CRS were reused; no new trusted setup or MPC was run for these
experiments. Every browser verification returned true, every browser proof
was accepted by the release native verifier, and every preprocess output
matched native bytes. Proof size remained 1,184 bytes.

| Final mode | Preprocess (s) | Prove (s) | Verify (ms) |
| --- | ---: | ---: | ---: |
| Default digest off, uninstrumented | 3.365085 | 21.545060 | 25.985 |
| Default digest off, instrumented | 3.327365 | 21.728970 | 25.485 |
| Explicit digest on, uninstrumented | 3.442125 | 23.836170 | 27.115 |

These three closure samples check the final paths; they are not an alternating
policy-performance experiment. The instrumented default path recorded no CRS
payload hashes. Fixture acquisition and installation precede the public prove
timer; CRS reads, preparation, worker transfers and proving are inside it.
[Final raw evidence](evidence/wasm-w0-w7-final.json).

The acceptance table uses each candidate's freshly measured, digest-off,
uninstrumented control, not adjacent rows as a continuous timing series.
Different sessions have different baselines; do not sum the reductions or
attribute between-session differences to code changes.

| Experiment | Control mean (s) | Candidate mean (s) | Decision |
| --- | ---: | ---: | --- |
| W1 selection accumulation | 37.897788 | 32.739713 | Accept, 13.61% |
| W2 boundary cancellation | 32.713608 | 31.464700 | Accept, 3.82% |
| W3 copy recurrence | 31.556713 | 29.215220 | Accept, 7.42% |
| W4 nonpublic chunk partition | 26.856055 | 26.531263 | Accept, 1.21% |
| W5 same-commitment MSM fusion | 26.376928 | 26.133078 | Accept, 0.92% |
| W6 polynomial batch operations | 26.164143 | 23.226283 | Accept, 11.23% |
| W7 mask separation | 23.128028 | 22.105708 | Accept, 4.42% |
| W7 subsequent spectrum reuse | 21.900315 | 21.692540 | Accept, 0.95% |

W0 is a separately approved default-off/explicit-opt-in digest policy, not
an arithmetic optimization. Rejected candidates were zero-copy CRS views,
cache expansion, changing the MSM chunk exponent and density-aware scalar
filtering. The last one regressed in both whole-prover pairs despite a useful
sparse unit benchmark. No rejected candidate remains enabled.

### Final prove stage diagnostic

One instrumented final run, default digest off; milliseconds. Named stage
intervals cover all but 0.045 ms of the public call; that residual is listed
separately rather than attributed to arithmetic. Nested counters overlap these
intervals (and concurrent field operations can overlap each other), so they
must not be added to this table. This is a diagnostic sample, not the paired
acceptance control.

| Stage | Time (ms) | Prove share | Further candidate |
| --- | ---: | ---: | --- |
| Input admission | 2.935 | 0.01% | Low priority; retain admission |
| Domain | 0.020 | 0.00% | Low priority |
| Connection permutation | 141.065 | 0.65% | W10.6 evaluation-vector batching |
| Witness slots | 3.840 | 0.02% | Low priority |
| Witness maps | 325.610 | 1.50% | W10.6 coarser sparse tasks |
| Public checks and masks | 11.110 | 0.05% | Low priority; retain checks/masks |
| Arithmetic quotient | 586.535 | 2.70% | W10.5 coset quotient; W10.6 mask fusion |
| Public polynomial | 0.610 | 0.00% | Low priority |
| Commit C_L / C_H | 5286.610 | 24.33% | W10.3 delivery reuse; W10.4 signed MSM |
| Binding C_O | 336.885 | 1.55% | W10.3/4 MSM; W10.6 bounded read-ahead |
| Selected roots | 14.865 | 0.07% | Low priority |
| Selection witness | 6.515 | 0.03% | Low priority |
| Selection quotients | 178.015 | 0.82% | W10.6 cofactor batching/access locality |
| Commit D_Q / D_Q,K | 2637.990 | 12.14% | W10.3 shared scalar preparation; W10.4 MSM |
| First transcript | 4.205 | 0.02% | Low priority; preserve message order |
| Commit C_D | 2632.605 | 12.12% | W10.3/4 MSM; W10.6 linear-combination fusion |
| Second transcript | 0.450 | 0.00% | Low priority |
| Copy-relation dispatch | 0.040 | 0.00% | Low priority |
| Copy recurrence | 422.895 | 1.95% | W10.2 numerator/denominator batching |
| Copy interpolation / factor preparation | 114.690 | 0.53% | W10.6 linear-combination fusion |
| Copy boundary quotient | 152.305 | 0.70% | W10.1 existing batched Ruffini/scale |
| Copy product quotient | 768.045 | 3.53% | W10.5 coset quotient; W10.6 pointwise fusion |
| Commit C_R | 1306.825 | 6.01% | W10.3/4 MSM |
| Combine quotients | 21.210 | 0.10% | W10.6 linear-combination fusion |
| Commit C_Q | 1317.660 | 6.06% | W10.3/4 MSM |
| Challenge evaluations | 36.845 | 0.17% | Already batched/concurrent; low priority |
| Opening combination | 25.125 | 0.12% | W10.6 combination/opening fusion |
| Opening pi_chi | 4052.775 | 18.65% | W10.3/4 MSM; W10.6 intermediate buffers |
| Opening pi_plus | 1339.495 | 6.16% | W10.3/4 MSM |
| Final transcript | 0.460 | 0.00% | Low priority |
| Encode | 0.690 | 0.00% | Low priority |
| Unattributed public-call residual | 0.045 | 0.00% | Not a measured arithmetic stage |
| Public prove total | 21728.970 | 100% | |

The remaining large stages are commitments/openings, including their CRS
reads and MSM dispatch; they are not measurements of pure curve instructions.
The W8 preprocess and W9 online-verifier proposals were later discarded. No
live MPC, publishing, CUDA measurement or version update was performed.

### Further WASM prove opportunities after W0--W7 — review, not results

This section is for engineers selecting follow-up experiments against
`d148f0c9d`. The stage table above is the existing final W0--W7 diagnostic,
not a new measurement or a prediction. The follow-up W10 identifiers do not
reopen completed W0--W7 experiments. The historical 2026-09-14 sequence
placed W10 before W9 and W8; W9 and W8 were later discarded. Controls include
shared changes already accepted in earlier experiments.

Aggregation of the `profile-off` operation records in
[the final evidence](evidence/wasm-w0-w7-final.json) gives:

| Nested prove operation | Calls | Time (ms) | Prove share |
| --- | ---: | ---: | ---: |
| G1 MSM API | 31 | 17906.705 | 82.41% |
| CRS range reads | 243 | 768.295 | 3.54% |
| Scalar Montgomery-to-raw batches | 31 | 49.290 | 0.23% |
| CRS payload hashes | 0 | 0 | 0% |

These intervals are already inside the stage table. The MSM boundary includes
dispatch, worker copies, arithmetic and reduction; it does not establish that
82.41% is pure group arithmetic. Commitments and openings together account
for 18910.845 ms, including their reading, field work and MSM. Concurrent
witness IFFTs and challenge evaluations have overlapping operation durations;
do not sum them as elapsed time. No new candidate timing has been measured.

**W10.1: finish batching the copy boundary.**
[The current boundary](../../wasm/src/univariate/reference-prover.ts) still
calls synchronous `ruffini()` and `scale()`: 91.755 and 60.440 ms respectively.
Use the existing buffer Ruffini and scaling operations already exercised by
openings. Preserve `R_hat(1)=1`, masks and constant-polynomial behavior.
The target is the remaining scalar implementation, not another application
of the already accepted vanishing-factor cancellation.

**W10.2: batch recurrence operand construction.**
The recurrence's numerator/denominator construction and successive root powers
remain a JS scalar loop. The recorded batch inverse costs 14.285 ms and the
ordered recurrence 48.345 ms within the 422.895-ms stage. The approximately
360.265-ms remainder includes construction and surrounding work, not a
separately measured pure construction interval. Move construction into a
whole-buffer kernel; partition independent ranges using their correct initial
root powers if worthwhile. Preserve zero-denominator rejection and final
cycle closure. Do not replace the already batched inverse or ordered recurrence
with a prefix-scan implementation before this target is measured.

**W10.3: reduce repeated delivery inside MSM.**
The installed ffjavascript 0.3.1 `src/engine_multiexp.js` submits identical
base/scalar buffers in a separate `ALLOCSET` task for each scalar window.
At 262144 points, its rule chooses 14-bit windows and 19 window tasks. Each
input contains 24 MiB of affine G1 bases and 8 MiB of scalars: 608 MiB summed
over those tasks. This is a source-derived logical task payload, not measured
bandwidth, total copy count or peak memory.

First measure preparation, queue/transfer, bucket computation and reduction
separately. Then test multiple windows per existing worker task, retaining
parallelism based on the available worker count. Separately test shared scalar
conversion/recoding for D_Q and D_Q,K and shared base delivery for C_L/C_H.
Keep all outputs distinct; sharing inputs is not combining transcript points.
Use invocation-local task buffers rather than a new persistent cache, worker
pool or public lifecycle API. Compare the complete operation including copies.

**W10.4: signed-window MSM and half-range buckets.**
[Native's accepted kernel](../../rust/prove/src/univariate/msm_kernel.rs) uses
signed digits, smaller nonfinal bucket ranges and an input-size window rule.
The installed wasmcurves `src/build_multiexp.js` extracts unsigned digits and
allocates the full bucket range. Test the native arithmetic approach using
existing WASM group primitives, with independent nearby window-width tests.
Preserve the final carry and identity-safe accumulation. Native P13.4's
7.69% whole-prover improvement is motivation, not a WASM estimate; neither
its exact window heuristic nor its rejected alternatives are pre-accepted.

**W10.5: coset quotient construction.**
Compare the current unmasked 2N-transform product/division path with evaluation
on an N-point coset, division by the nonzero vanishing value, and interpolation
of the degree-below-N quotient. Retain the accepted short-mask decomposition.
Arithmetic and copy quotients are separate experiments, each with its own
degree proof and divisibility checks. Smaller transforms do not imply half
the time: additional operand transforms, coefficient scaling, checking and
copies must be included. A coset interpolation alone does not prove exact
division; retain an equivalent check that the numerator vanishes on the
original domain, and test non-divisible inputs. The existing product/division
implementation is the independent test oracle. No protocol or CRS change is
needed for a valid implementation specialization.

**W10.6: remaining field and delivery candidates.**
After re-profiling, independently test multi-term linear-combination kernels,
short-mask convolution, fused pointwise product differences, and
combination-plus-Ruffini processing where they remove measured transfers or
intermediate buffers. Secondary targets are coarser placement-level sparse
tasks, permutation-vector construction, cofactor construction/access locality
and bounded CRS read-ahead. Each is a separate accept/reject experiment;
none has a promised benefit. Preserve remainder, selector, public-buffer and
structural checks. Do not optimize the sub-millisecond transcript/encoding
path by weakening it.

For every candidate: run isolated equivalence/rejection tests, affected
native/WASM E2E, alternating optimized-browser timings and a report update
before the next change. Record preparation/transfer costs, memory, raw samples,
warm-up exclusions and variation; retain only reproducible improvements.
Keep digest off by default and verify the explicit-on path separately.
Do not repeat the rejected cache enlargement, zero-copy view, unchanged-kernel
chunk-size tuning or JS zero-scalar filtering without new evidence. W10.3's
worker-task grouping and W10.4's arithmetic kernel are different experiments
from those rejected delivery-bound changes. No SHA acceleration, unbounded
MSM, speculative fixed-base tables or competing outer worker pool is planned.

### W7: masked quotient FFT reduction — mask separation and spectrum reuse accepted

The first candidate expands the mask terms algebraically before division.
Writing `Z=X^N-1`, the arithmetic quotient is
`(U*V-W)/Z + U*muV + V*muU + muU*muV*Z - muW`.
For the copy quotient, with `Rplus=R(omega*X)` and
`muRplus=muR(omega*X)`, it is
`(Rplus*G-R*F)/Z + (Rplus-R)*muB + muRplus*G - muR*F + (muRplus-muR)*muB*Z`.
All masks and exact divisibility checks remain. The large products operate
on unmasked degree-below-domain polynomials; for the application fixture this
halves the transform size from 1,048,576 to 524,288 field elements. Short
cross terms use W6's measured batch-add multiplication.

Independent comparisons included zero/nonzero masks, non-divisible inputs,
and arithmetic/copy domain pairs `(1,2)`, `(8,32)` and `(64,16)` without
assuming equal domains. At `N=262144`, two alternating unit pairs measured
arithmetic means **1083.198 → 526.205 ms** and copy means
**1939.864 → 996.310 ms**, with exact quotient coefficient equality.
[Unit samples](evidence/wasm-w7-masks-micro.json).
Four alternating minified ES2022 E2E samples measured control prove
**22.981670 / 23.274385 s** and candidate **22.009630 / 22.201785 s**.
Means were **23.128028 → 22.105708 s (4.42% reduction)**, improving both pairs.
All browser verifications, release-native cross-verifications and native
preprocess byte comparisons passed; direct TypeScript checking passed.
Mask separation is accepted. [E2E samples](evidence/wasm-w7-masks.json).
The subsequent compatible-spectrum reuse experiment is a separate gate.
Its candidate shares `R`'s forward transform between the two copy products,
rotates its spectrum by two entries on the `2N` FFT domain to represent
`R(omega_N*X)`, subtracts products before inversion, and performs one inverse
transform. It checks the root relation and degree bounds needed to prevent
cyclic aliasing. Arithmetic and connection domains are not conflated.
Existing parallel FFT APIs are called sequentially; no competing worker pool
is introduced. Live buffers include three `2N` spectra and a rotated spectrum
plus products/worker copies, trading retained buffers for two fewer transforms.
These are allocation bounds, not a sampled peak-memory result.

Independent base-product comparisons passed at `N=1,2,8,32,262144`;
out-of-bound degrees and noncanonical copy roots were rejected. Full masked
quotient equivalence and unequal-domain tests passed again. The isolated
base-difference means were **870.416 → 577.268 ms**; the whole-prover
control is the accepted mask-separated implementation, not the original
generic masked product. [Spectrum unit samples](evidence/wasm-w7-spectrum-micro.json).

Four further alternating optimized browser runs measured **21.832085 /
21.968545 s** for the mask-separated control and **21.637600 / 21.747480 s**
with spectrum reuse: means **21.900315 → 21.692540 s**, a further **0.95%
reduction**, improving both pairs. All four browser verifications,
native cross-verifications and preprocess byte comparisons passed. Spectrum
reuse is accepted on this measured fixture; the small whole-prover gain must
not be described as the much larger unit-level gain or a hardware-independent
guarantee. [Spectrum E2E samples](evidence/wasm-w7-spectrum.json).

### W6: whole-buffer polynomial operations — accepted

The candidate uses existing worker kernels for long linear combinations,
Horner evaluation, argument scaling and Ruffini openings. A univariate
descending-coefficient kernel returns both quotient and remainder for division
by `X^N-1`; the caller still rejects every nonzero remainder. Short masks now
update only their low and shifted coefficients, and products with a degree-at-most-three
factor use shifted batch additions instead of a large FFT. No new worker pool,
hidden trust cache or synchronous WASM-memory adapter is introduced.

Independent exact comparisons covered constants, unequal polynomial lengths,
overlapping vanishing shifts, degrees above twice the domain size, zero
polynomials and non-divisible inputs. At 262,144 coefficients, two alternating
unit pairs measured the following means, including preparation and worker
transfers (not browser whole-prover times):

| Operation | Scalar/FFT control (ms) | Batched candidate (ms) |
| --- | ---: | ---: |
| Two-term linear combination | 115.985 | 10.618 |
| Exact vanishing division | 173.342 | 44.851 |
| Horner evaluation | 91.645 | 24.483 |
| Ruffini quotient | 93.755 | 30.278 |
| Long polynomial × cubic mask | 427.453 | 17.291 |
| Cubic mask × vanishing polynomial | 44.492 | 0.321 |

[Unit samples](evidence/wasm-w6-polynomial-micro.json). Whole-prover admission
requires the separate paired E2E measurements below; these unit ratios alone
are not a claimed prover speedup. Worker input/output copies remain, and
concurrent evaluations may temporarily retain several full coefficient
buffers. Peak process memory has not been sampled.

With the same W4 compressed fixture and W5 fusion control, minified ES2022
browser prove measured **25.902140 / 26.426145 s** for control and
**23.204800 / 23.247765 s** for the candidate: means **26.164143 → 23.226283 s**,
an **11.23% reduction**, improving both pairs. All four browser verifications,
native proof cross-verifications and preprocess byte comparisons passed.
Direct TypeScript checking passed. W6 is accepted; no extrapolation from
the unit speedup factors is used. [E2E samples](evidence/wasm-w6-polynomial.json).

### W0: explicit runtime digest checking — accepted policy alignment

The public prove/preprocess APIs now default to no CRS payload hashing and
accept per-call `checkDigests: true`. Structural admission and converter/build
validation are unchanged. Isolated tests cover zero default hasher calls,
opt-in success/mismatch, checked-byte reuse, independent calls and malformed
length/section rejection in both modes. Direct TypeScript checking passed.

Four alternating minified ES2022 runs used the same existing compressed CRS
and 207-placement fixture. All browser verifications returned true, preprocess
bytes matched native, and the release native verifier accepted all four browser
proofs. This reproducible runner uses installed Chromium **149.0.7827.55**;
the older Chrome 153 table below is not its paired performance control.

| Mode | Prove run 1 (s) | Prove run 2 (s) | Prove mean (s) | Preprocess mean (s) |
| --- | ---: | ---: | ---: | ---: |
| Default digest off | 37.863755 | 37.475035 | 37.669395 | 3.518960 |
| Explicit digest on | 41.642445 | 41.824145 | 41.733295 | 3.669640 |

These are fresh measured instrumented samples, not subtraction of an earlier
SHA span. Off-mode instrumentation recorded no payload hashes. Reader cache
capacity remains two chunks; no persistent state or new CRS allocation was
introduced. Peak memory was not measured for this policy-only change.
[Raw samples](evidence/wasm-w0-digest-baseline.json).

The broader `typecheck:development` command fails in an unchanged generator
test fixture (`m_D=48`, `m=8`, `s_D=1`) which violates `m_D=m*s_D`.
That unrelated fixture was not repaired or counted as a passing test. Initial
native cross-verification needed the documented macOS `DYLD_LIBRARY_PATH`;
with it supplied, verification succeeded without code changes to native.

The execution sections record each subsequent acceptance/rejection gate. W8
and W9 were later discarded rather than implemented. Reproduction from `wasm`:

```sh
DYLD_LIBRARY_PATH="$PWD/../external-lib/mac/lib" node test/profiling/run-current-univariate.mjs /tmp/tokamak-p8-trusted-e2e-9jQ5E1 tmp/optimization-w0-qualification profile-off profile-on profile-off profile-on
```

### W1: batched selection accumulation — accepted

One worker task now accumulates multiple independent wire rows using the
existing scaled-add WASM kernel internally. Worker count follows the existing
runtime; no outer worker pool was introduced. Scalar polynomial oracles cover
widths 1/2/8/32, empty and uneven row counts, zeros, negative field values and
inactive selector slots; malformed shapes reject. Direct TypeScript checking
passed. At width 256 and 32 rows, alternating independent Node measurements
(including dispatch/copy) were 974.468/967.835 ms control versus 28.834/30.623 ms
candidate for dense values, and 61.981/65.522 versus 3.196/3.521 ms for sparse
values. These microbenchmarks are not whole-prover speedups.

| Release-optimized browser prove | Run 1 (s) | Run 2 (s) | Mean (s) |
| --- | ---: | ---: | ---: |
| W0 control, digest off | 37.991455 | 37.804120 | 37.897788 |
| W1 candidate, digest off | 32.820850 | 32.658575 | 32.739713 |

The paired mean decreased 13.61%. All four samples returned true, matched
native preprocess bytes and passed release native cross-verification. The
minified uninstrumented bundles used Chromium 149 and the same compressed CRS.
The candidate adds a packed s*s cofactor buffer and one copy per active worker
(2 MiB each at s=256; up to 14 worker copies on this host), plus batched
input/output buffers. This is an allocation bound, not a sampled memory peak.
[Whole-call evidence](evidence/wasm-w1-selection.json).

### W2: copy-boundary cancellation — accepted

The prover computes `(R_hat-1)/(N_C*(X-1))` by synthetic division and checks
the remainder equals one before scaling. It no longer constructs dense L_0
or multiplies and divides by the connection vanishing polynomial. Masked,
constant and malformed boundary tests at N=1/2/8/64 match the previous dense
formula exactly or reject. At N=262144, independent alternating measurements
were 1041.547/995.953 ms control and 150.217/150.180 ms candidate.

| Release-optimized browser prove | Run 1 (s) | Run 2 (s) | Mean (s) |
| --- | ---: | ---: | ---: |
| W1 control, digest off | 32.732015 | 32.695200 | 32.713608 |
| W2 candidate, digest off | 31.610860 | 31.318540 | 31.464700 |

The paired mean decreased 3.82%. All four samples passed browser verification,
native preprocess byte equality and release native cross-verification. Direct
TypeScript checking passed. At this domain the 8-MiB L_0 vector and the larger
product/FFT temporaries are removed; peak memory was not sampled.
[Whole-call evidence](evidence/wasm-w2-copy-boundary.json).

### W3: batched inversion and forward recurrence — accepted

Every denominator is checked for zero before batch inversion. A whole-loop
WASM kernel computes the forward univariate prefix product, and the caller
checks the final closure equation. The old bivariate reverse/transposed
recurrence is not reused. Independent tests match scalar division at lengths
1/2/8/32/262144 and reject zero first/last denominators, invalid closure and
empty kernel input. At length 262144, alternating unit times were
2402.355/2376.173 ms control versus 397.033/424.399 ms candidate, including
factor construction, inversion and worker transfer.

| Release-optimized browser prove | Run 1 (s) | Run 2 (s) | Mean (s) |
| --- | ---: | ---: | ---: |
| W2 control, digest off | 31.667390 | 31.446035 | 31.556713 |
| W3 candidate, digest off | 29.119290 | 29.311150 | 29.215220 |

The paired mean decreased 7.42%. All four browser/native cross-checks passed;
preprocess bytes were unchanged and direct TypeScript checking passed.
The candidate uses additional numerator/denominator/inverse buffers of 8 MiB
each at this domain plus worker copies; it does not introduce another worker
pool. Peak memory was not sampled.
[Whole-call evidence](evidence/wasm-w3-copy-recurrence.json).

### W4: retired aggregate-reader experiment — historical only

The former `compare-crs-reads.mjs` trace and its aggregate/global-wire fixture
were removed with P18.0.4. The measurements below are retained solely as
historical evidence for the superseded reader; they are not an executable
benchmark, current input format, or decision input for the normalized local-grid
protocol. Positional local file reads were never browser-fetch timings.

Sixteen retained chunks reduced repeated-sequence reads from 301,988,736 to
100,662,912 bytes, but did not reduce first-touch binding overfetch. Browser
control times were 28.948305/29.121165 s; cache-16 times were
28.479370/29.164230 s. The 0.73% mean difference reversed in the second pair
and overlaps ordinary variation. Rejected: the production cache remains two
chunks, avoiding an unsupported increase from 16 to 128 MiB retained payload
at the fixture's 8-MiB partition. All four native/browser checks passed.
[Cache experiment](evidence/wasm-w4-cache.json).

The same binding trace read 469,760,256 bytes at the original partition,
226,478,592 at 1 MiB and 62,375,040 at 256 KiB. Mean local read times were
47.656, 36.378 and 27.578 ms respectively; request counts rose from 56 to
216/238. The subsequent paired browser experiment used the same source bytes,
with only nonpublic physical chunks repartitioned to at most 256 KiB:

| Release-optimized browser prove | Run 1 (s) | Run 2 (s) | Mean (s) |
| --- | ---: | ---: | ---: |
| Original 8-MiB partition | 26.859375 | 26.852735 | 26.856055 |
| Nonpublic 256-KiB partition | 26.506055 | 26.556470 | 26.531263 |

Both pairs improved (mean 1.21%). All browser/native verification and
preprocess byte checks passed. The converter now caps only nonpublic chunks
at 256 KiB; other sections retain the requested partition. The native CRS
and logical point sequences are unchanged. A full conversion of the existing
trusted-setup CRS produced exactly the same chunk ranges and payload SHA
values as the E2E-qualified repartition. An independent 6001-point offline
roundtrip tests split boundaries, digests, empty sections and malformed input.
Direct TypeScript checking passed. Smaller chunks reduce payload retention
but increase manifest entries/file requests; no peak-memory claim is made.
[Partition evidence](evidence/wasm-w4-partition.json). These per-candidate
controls are used instead of combining timings from different run sessions.

### W5: MSM delivery experiments — fusion accepted; filtering/chunk change rejected

Independent timings include scalar conversion and any filtering/fusion copies.
The bounded 2^16/17/18/19 point sweep did not justify changing the existing
2^18 default (means 1364.558/1249.029/1254.520/1269.147 ms). Dense filtering
regressed; 50% or more zeros gave a clearer benefit. Combining 256 small MSM
sources belonging to one commitment decreased unit time from 629.483 to
170.510 ms. [Independent samples](evidence/wasm-w5-msm-micro.json).

The all-zero test exposed a pre-existing identity bug: ffjavascript returns
projective infinity for an all-zero MSM, but adding it to affine infinity
produces an invalid point. The shared MSM accumulator now skips identity
terms and initializes from the first nonidentity result. Empty/all-zero,
uneven chunks, scalar-sum and invalid-length tests pass; no group encoding or
verifier policy was changed. This is a correctness repair, not a claimed
speedup. A bounded coalescer then combines only C_O's public, nonpublic and
mask terms. No different transcript commitments are merged.

| Release-optimized browser prove | Run 1 (s) | Run 2 (s) | Mean (s) |
| --- | ---: | ---: | ---: |
| W4 control, digest off | 26.255945 | 26.497910 | 26.376928 |
| C_O fusion candidate, digest off | 26.122150 | 26.144005 | 26.133078 |

Both pairs improved; the mean decreased 0.92%. All four native/browser checks
passed with identical native preprocess bytes. The coalescer adds at most one
current output pair of maxPoints*(96+32) bytes (32 MiB at 2^18), with a fresh
pair after a yielded full chunk; this is not a peak-memory measurement.
[Whole-call fusion evidence](evidence/wasm-w5-fusion.json).

The subsequent density-aware candidate scanned every chunk and compacted only
when at least half its scalars were zero. Despite the sparse microbenchmark
gain, whole-prover controls were 25.950790/26.163495 s and candidates were
26.100950/26.378725 s: a 0.70% regression in the mean, worse in both pairs.
Rejected and removed. The retained implementation has no new scalar scan or
index/compaction allocation. All four native/browser checks passed.
[Filtering evidence](evidence/wasm-w5-filter.json). W5 is complete: identity-safe
accumulation and bounded C_O fusion remain; the original MSM chunk size stays.

## WASM optimization baseline and execution plan — 2026-09-13

This section records the detailed pre-optimization timing table for backend
performance engineers. It complements the earlier Chromium 149 functional
qualification rather than replacing its measurements.

Source: `cd72c162281c2b4058e6bbc70e130988ec4ed516`; Apple M4 Pro,
14 logical CPUs, Chrome 153, minified ES2022 bundle and ffjavascript 0.3.1.
The existing 207-placement local-QAP fixture and compressed trusted-setup CRS
were reused. The two profiled and two completed uninstrumented runs all
verified successfully and matched native preprocess bytes. Runtime CRS
loading, SHA and worker transfers are included; compilation, initial fixture
fetch and installation are separate. No optimization candidate was applied.

**Digest mode of these samples:** the measured WASM reader unconditionally
checked loaded chunk digests. The subsequent policy decision aligns runtime
CRS reads with native prove: default digest computation is off; an explicit
option enables it. That change is planned, not implemented or measured here.
Do not subtract the SHA span from these totals and present the result as a
measurement of the future default path.

The [detailed opportunity report](current-univariate-wasm-profile.md) owns
the candidate rationale and reproduction procedure. The
[raw samples](evidence/current-univariate-wasm-profile.json) are unchanged.

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

### Detailed prove stages

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

### Inclusive operation breakdown

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

### Preprocess and verify stages

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


### Planned execution and evidence gates

1. W0: align optional CRS digest checking with native prove and measure new
   default/off and explicit/on baselines separately. Preserve structural
   admission and opt-in digest-mismatch rejection.
2. W1--W3: selection accumulation batching, copy-boundary cancellation and
   batched copy inversion/ordered recurrence.
3. W4--W7: independently evaluate CRS loading, MSM delivery/filtering,
   whole-buffer polynomial kernels and mask-aware quotient FFT reduction.
   Use the W0 default-path baseline for optimization acceptance, with digest-on
   compatibility tests reported separately.
4. W8 preprocess and W9 online-verifier experiments were proposed in this
   historical profile, then discarded on 2026-09-20 without implementation.

For every candidate, record the hypothesis, isolated correctness test,
complete affected native/WASM E2E, alternating repeated optimized-build
timings, memory/loading costs and acceptance or rejection before proceeding.
Keep the same compressed CRS unless the candidate specifically tests its
physical chunk partition; then retain identical logical points and inputs.
No dense delivery format, SHA acceleration experiment, live MPC, publication,
version bump or verifier trust-policy change is part of this sequence.

This historical profiling checkpoint preceded implementation. The WASM
optimization execution sections above supersede its then-unstarted status;
temporary planning records are not required to interpret this report.

## Historical native and browser E2E qualification — 2026-09-13

This pre-normalized-layout checkpoint is retained only as historical evidence.
Its retired aggregate interface-width terminology and global-wire details do
not describe the current protocol or artifact format.

Fresh native trusted setup supplied all four CRS files for each of two local
execution fixtures. Both used the current local QAP library: 44 compiled
circuits, n=m=m_I=1024, s=256, t=64, l=396 and l_free=256.
The minimal execution retained only the six required public buffers, with
250 inactive slots and identity interface permutation. The application-sized
execution used 207 active placements and 49 inactive slots. The minimal
execution is not a reduced-size circuit library.

Native preprocess and prove used the release-built arkworks CPU path.
The native verifier was rebuilt for each generated key. Browser code was
bundled with esbuild minification, ES2022 target, and ffjavascript 0.3.1;
verification used build-generated field values, G1 tables and prepared G2
operands, not a runtime verifier CRS. Chromium 149.0.7827.55 ran headlessly.
No MPC, CUDA benchmark, npm publication or Drive operation was performed.

| Stage | Minimal native | Minimal Chromium | Application-sized native | Application-sized Chromium |
| --- | ---: | ---: | ---: | ---: |
| Trusted setup, entire internal operation | 11.090 s | Native output reused | 11.656 s | Native output reused |
| Preprocess | 0.170 s | 2.207 s | 0.391 s | 3.358 s |
| Prove, including runtime input loading | 2.315 s | 22.818 s | 3.920 s | 38.091 s |
| Verify, including dynamic input decoding | 4.048 ms | 25.965 ms | 4.198 ms | 24.725 ms |
| Verification result | true | true | true | true |

These are individual functional-qualification samples, not alternating paired
performance experiments. Native spans exclude compilation; cached cargo
startup is also excluded from these internal timings. Browser timings include
HTTP chunk loading. Browser installation was separate: 67.570 ms in the final
application-sized sample. Its earlier sample measured prove at 40.671 s;
that variation is retained rather than attributed to a new optimization.
Node using the same WASM arithmetic measured 37.951 s for application-sized
proving, separately from Chromium.

The application-sized native process RSS maxima were 2,404,679,680 bytes for
setup, 230,129,664 for preprocess, 2,728,148,992 for prove and 9,601,024 for
verify. These use macOS `time -l` around cached cargo invocations. Chromium's
maximum sampled sum of process RSS was 6,367,330,304 bytes at one-second
intervals. It includes browser infrastructure and is not an exact peak or
a directly comparable single-process measurement.

### Interoperability and rejection evidence

- Native and WASM preprocess outputs are byte-identical on both executions.
- Native proofs verify in Chromium; Chromium proofs verify in native.
- The canonical proof is 1,184 bytes: ten G1 points and seven scalars.
  Preprocess is 384 bytes: S_C and C_fix in G1, E_kappa in G2.
- Three test-only native scalar-oracle fixtures produce exactly the same
  complete proof bytes in WASM. They cover unequal arithmetic/connection
  domains in both directions, a fixed-public value, free-public padding,
  an internal circuit with placement different from its ID, a selector hole,
  and singleton domains with all placements inactive.
- All six Fiat–Shamir rounds match the common native preimage/challenge
  fixtures. The production API has no deterministic-randomness option.
- Native and WASM reject mutations of each of the ten proof points, seven
  evaluations, three preprocess operands and a free-public value. Malformed
  lengths, noncanonical scalars and wrong-subgroup points are rejected.
- The WASM fixed-key build rejects missing, truncated, noncanonical,
  zero and wrong-subgroup keys. A development directory containing only
  `verifier_keys.rkyv` suffices; unrelated CRS roles are not read to build it.

The rejection checks exposed an ffjavascript affine-identity edge case:
multiplying its affine identity by the scalar-group order did not preserve
the identity encoding. Point admission now recognizes the identity before
the nonidentity subgroup check. An independent roundtrip regression covers
both G1 and G2 identities. Singleton-domain parity also removed a retired
WASM-only nontrivial-domain restriction.

### Completed storage correctness requalification

The four native payloads total 957,268,688 bytes. Their browser representation
has 19 sections and 132 chunks, totaling 957,268,320 point bytes; the largest
chunk is 8,388,576 bytes. No whole-CRS JavaScript buffer is created. An untimed
scan of every stored point found zero infinities in every section, hence
empty infinity-run histograms and zero run-table entries. Omitted coordinates
are not counted as stored infinities.

The separate library-invariant omission count remains 10,694,144 nonpublic
query slots. There are 6,006,784 retained nonpublic points and no per-point
query-coordinate metadata. The preserved dense and omitted oracle archives
were compared again: all 6,006,784 retained points and all other prover
sections agree. Release tests also requalified dense/omitted binding equality,
the scalar-oracle proof, CPU/ICICLE parity and retained arithmetic kernels.
ICICLE CPU-provider parity does not establish CUDA execution.

No new dense-versus-omitted whole-prover timing experiment was performed.
That comparison and its proposed test-only dense reader were withdrawn:
dense CRS is not a delivery format. P8's functional and storage-correctness
qualification is complete. The earlier paired storage and native optimization
measurements below remain intact. WASM profiling is complete; optimization
implementation remains unstarted and uses the actual compressed CRS.

The [machine-readable record](evidence/current-univariate-e2e.json) contains
timings, source hashes, file sizes, all section counts and qualification
boundaries. Native release tests passed for prove (12, with 6 opt-in
benchmarks ignored), libs (133, with 6 opt-in tests ignored) and the explicit
real-proof tamper test. All 20 common contract tests and the targeted WASM
type, contract, domain, relation, polynomial, transcript, preprocess, offline
CRS and architecture checks passed. This is not a claim that every historical
package script or production deployment workflow has been qualified.

To reproduce the cross-consumer checks from `packages/backend/wasm`, first
prepare an E2E directory with `inputs/subcircuits/library`,
`inputs/synthesizer`, native `crs`, `preprocess` and `prove` outputs.
Build the verifier against that directory's key and convert the four CRS
roles to its `chunks` directory:

```sh
BACKEND_WASM_VERIFIER_CRS_DIR=E2E_DIR/crs npm run build:development
npm run univariate-crs:convert -- --tau-sequence E2E_DIR/crs/tau_sequence.rkyv --keys E2E_DIR/crs --output E2E_DIR/chunks --chunk-bytes 8388608
npx tsx test/checks/univariate/check-native-cross.ts E2E_DIR E2E_DIR/chunks
npx tsx test/checks/browser/check-univariate-reference-browser.ts E2E_DIR
```

Rebuild native verify with `TOKAMAK_VERIFIER_KEYS=E2E_DIR/crs/verifier_keys.rkyv`
before checking the browser outputs. The fixtures must use the same local
library that the two builds select.

## Results at a glance

Storage omission removes query coordinates
whose witness coefficients are always zero under the admitted input contract.
CPU encoding then computes the retained points using shared fixed-base
preprocessing and batch normalization instead of independent scalar products
and affine conversions. Native proving separately reuses selection cofactors,
batches copy-denominator inversions, and combines multi-source commitments.

| Experiment | Control | Accepted result | Evidence boundary |
| --- | --- | --- | --- |
| Final P13 CPU optimizations, default digest-disabled mode | 4.3237 s mean process wall; 4.3088 s instrumented total | 3.8604 s wall; 3.8470 s total, 10.71% wall reduction | Five release pairs; quotient cancellation, zero filtering and signed-window MSM; later native verification is separate evidence |
| Hardware-separated native proving | ICICLE CPU: 8.559 s mean command | arkworks CPU: 5.988 s, 30.0% less time | Five alternating-order release pairs; proof generation and deterministic parity, not verification or CUDA timing |
| Storage omission (`893c3eb17`) | 1,983,906,512 payload bytes; 373.01 s mean setup | 957,268,688 bytes; 220.08 s mean setup | Two dense and two omitted full-library runs; retained-point and binding equality |
| CPU point encoding (`6258d1062`) | Compressed setup: 220.240 s mean | 12.216 s mean; 18.03x faster | Two control and five accepted full-library runs; all four payloads byte-identical |
| ICICLE precomputation comparison (`f9a4bd4df`) | Current arkworks large-input CPU path | Retained arkworks after testing 15 ICICLE configurations | Independent encoding comparison, not a full setup or CUDA comparison |
| Native selection interpolation | 594.937 s mean complete proof generation | 10.565 s mean | Two reference and three candidate runs, exact coefficient/oracle checks |
| Native copy inversion | 10.496 / 10.647 s interleaved controls | 8.970 s mean | Three candidates; zero-denominator and cyclic-recurrence tests |
| Native multi-source MSM | 8.109 s mean interleaved controls | 7.916 s mean | Five pairs; every candidate faster than its adjacent control |

These timings exclude compilation and refer to the host and library described
below. The storage and computation controls are separate experiments; the
18.03x figure is not a prover speedup or a result against the dense control.
For implementation entry points and transfer conditions, see
[reuse in prove and MPC setup](#reuse-in-prove-and-mpc-setup). Detailed
measurements, rejected alternatives and reproduction commands follow.

## Current prover implementation and evidence inventory

The latest recorded paired complete-prove result is the P13 row above, not
a new timing of HEAD. Its input policy differs from the historical always-on
digest runs. Do not multiply the successive speedups, add nested spans, or
attribute the difference between unrelated series to an individual API.
CPU/GPU selection, binary output and optional hashing are policy changes;
their costs must not be confused with isolated arithmetic improvements.

| Experiment or mechanism | Disposition and current path | Evidence / implementation |
| --- | --- | --- |
| Shared selection cofactors | Retained on both engines; one shared cofactor matrix, no dense witness grid | [Original isolated and full-command samples](evidence/current-univariate-prove.json); [engine](../../rust/prove/src/univariate/engine.rs), [schedule](../../rust/prove/src/univariate.rs) |
| Bulk copy inversion | Retained algorithmically; CPU now uses arkworks batch inversion, ICICLE retains its own field path. The historical ICICLE threshold is not a CPU rule | Same original samples; [engine](../../rust/prove/src/univariate/engine.rs) |
| Combined-source MSMs | Retained; hardware split also joins selection masks to query MSMs | [Original samples](evidence/current-univariate-prove.json), [hardware comparison](evidence/prover-hardware-split-comparison.json); [schedule](../../rust/prove/src/univariate.rs) |
| ICICLE per-proof base precomputation | Factors 2/4 rejected including table construction and three uses; no production cache | `msmPrecomputation` in [original evidence](evidence/current-univariate-prove.json); [isolated tests](../../rust/prove/src/univariate/optimization_tests.rs) |
| Mmap-backed owned decoding | Not adopted: isolated difference did not establish a whole-command win | `readBacking` in [original evidence](evidence/current-univariate-prove.json); [archive tests](../../rust/prove/src/univariate_crs.rs) |
| Primitive API comparison | Measurement only; conversion/kernel/output costs separated. Subsequent hardware split supplies integration evidence | [Specialist report](current-univariate-primitive-comparison.md), [raw samples](evidence/current-univariate-primitives.jsonl) |
| CPU arkworks / explicit ICICLE GPU, canonical binary proof | Implemented; only CPU whole-command speed measured, ICICLE CPU-provider parity is not CUDA execution | [Pre-split retiming](evidence/prover-hardware-split-baseline.json), [paired comparison](evidence/prover-hardware-split-comparison.json); [engine](../../rust/prove/src/univariate/engine.rs), [CLI](../../rust/prove/src/main.rs) |
| Arkworks reusable base tables and unsigned bounded windows | Rejected at three/four uses including construction; this does not reject the later signed-window kernel | [Specialist report](prover-arkworks-msm-reuse.md), [samples](evidence/prover-arkworks-msm-reuse.json); [benchmark](../../rust/prove/examples/msm_reuse_benchmark.rs) |
| P13.0 instrumentation and scalar counts | Diagnostic, not a speedup | [Paired timing](evidence/prover-p13-instrumentation.json), [counts](evidence/prover-p13-scalar-counts.json), [prior retiming](evidence/prover-retiming-before-p13.json) |
| P13.1 parallel hashes and validated-byte reuse | Retained on `--check-digests` only; not part of the current default path | [Hash pairs](evidence/prover-p13-parallel-hash.json), [reuse first](evidence/prover-p13-read-reuse-first.json), [reuse repeat](evidence/prover-p13-read-reuse-repeat.json); [admission](../../rust/libs/src/subcircuit_library.rs), [loader](../../rust/prove/src/univariate_cli.rs) |
| SHA acceleration | Excluded, not measured or implemented | P13.1c below; no hardware-hash speedup claimed |
| Copy-boundary cancellation | Retained on both engines with exact remainder check | [Primitive and command samples](evidence/prover-p13-boundary.json); [schedule](../../rust/prove/src/univariate.rs) |
| CPU zero-scalar filtering before point decoding | Retained; no GPU arithmetic or stored-query change | [First pairs](evidence/prover-p13-filter-pairs.json), [repeat](evidence/prover-p13-filter-repeat.json); [engine](../../rust/prove/src/univariate/engine.rs) |
| Signed windows and half-range buckets | Retained on CPU; stock arkworks remains a test oracle, wider/transposed alternatives rejected | [Kernel and command samples](evidence/prover-p13-msm-kernel.json); [kernel](../../rust/prove/src/univariate/msm_kernel.rs) |
| Scratch gathering and affine-range caching | Both rejected; scratch gains inconsistent, integrated affine cache slower | [Primitives](evidence/prover-p13-memory-primitives.json), [full cache pairs](evidence/prover-p13-affine-cache.json), [rejected patch](evidence/prover-p13-affine-cache.patch); [benchmark](../../rust/prove/examples/commitment_memory_benchmark.rs) |
| Final combined P13 qualification | Retained set measured directly, not by summing prior gains | [Five-pair final record](evidence/prover-p13-final.json) |

Sparse R1CS/map preparation, coefficient-domain vanishing division, compact
nonpublic ranges and source-specific opening aggregation were inherited from
the reference. Their presence is not evidence of a separately measured gain.
CPU currently uses arkworks `divide_by_vanishing_poly`; ICICLE uses the exact
coefficient recurrence for the required blinded degrees. Both check remainder.

### Current input modes and validation status

Default CLI execution reads common provenance identity metadata, then loads
and structurally admits the consumed CRS without hashing payloads or library
contents. With `--check-digests`, independent payload hashes run in parallel
and the loader reuses the validated tau/prover byte buffers. The explicit
development provenance bypass and direct library entry have their own file
ingress; neither is the default benchmark mode. Default digest disabling does
not disable mathematical input checks or authorize malformed archives.

The P13 final record includes a successful explicit-digest proof-generation
smoke test, not a new paired performance qualification of that mode. Historical
hash/reuse speedups remain scoped to their digest-enabled controls. The
historical primitive report's conversion boundary is likewise not the current
arkworks-native CPU pipeline.

The [preprocess qualification](#correctness-and-remaining-coverage) subsequently
resolved the stale shared fixtures. The implemented native verifier accepted a
fresh local proof, and [fixed-input verification qualification](current-univariate-verifier.md)
records valid-proof acceptance and tamper rejection after the retained verifier
changes. These results do not retrospectively verify every saved benchmark
proof or complete the native/WASM cross-proof and storage/reference matrix.
The fresh native/Chromium runs above now qualify WASM and cross-proof
interoperability. The controlled whole-prover storage A/B, actual CUDA
arithmetic execution and live MPC qualification remain separate. Native
verifier builds require matching library metadata and `TOKAMAK_VERIFIER_KEYS`;
keys are not runtime inputs.

### Evidence audit and reproduction limits

The 2026-09-12 audit recomputed retained full-command means from the tracked
hardware-split and P13 instrumentation/hash/reuse/boundary/filter/kernel/cache/
final JSON records, excluding their declared warmups. The published rounded
means agree; raw samples and rejected patches were not changed. The primitive
and original native-stage records remain linked with their independent scope.
No new proof, benchmark or E2E was run for this audit.

The final P13 control/candidate binaries and listed local input paths were
present at audit time. Presence is not a fresh hash verification, nor a durable
distribution mechanism: these `/tmp` inputs and binaries are not tracked
reproduction assets. Check the recorded identities before replay; replacement
inputs produce a new experiment, not a reproduction of those samples.

[`compare-release.mjs`](../../rust/prove/optimization/compare-release.mjs)
is a historical macOS runner: it reads arguments, host metadata and input paths
from the hardware-split evidence, uses `/usr/bin/time -l`, and assumes the
macOS native-library location. It checks input hashes but does not discover a
new host or arbitrary fixtures. Do not use it as a portable automatic benchmark
or interpret its copied host fields as new hardware detection. Historical
controls require their pinned revision/binary and matching inputs; current
commands below do not recreate earlier implementations.

## Historical Pre-Normalized Storage Reference and Candidates

This experiment predates the normalized library layout. Its aggregate-width and
flatten-map references are historical observations, not an input or storage
contract for the current prover or CRS.

The dense reference is commit `f276370fc`. The local QAP library contains 44
compiled circuits, with n=m=1,024, m_I=1,024, s=256, t=64 and m_D=45,056.
The full reference has four RKYV payloads totaling 1,983,906,512 bytes.
Timing runs use release builds, the same ICICLE CPU installation and fixed
development generators/scalars. Compilation is excluded. These deterministic
scalars are a test control, never production setup material.

- A omits nonpublic query coordinates outside the actual compiled catalog or
  beyond a compiled circuit's flatten-map length. Public queries keep their
  existing separate representation.
- B retains the original nonpublic slots but replaces exactly those eligible
  coordinates with the group identity. It is measured without a run codec.

Eligibility follows from the admitted witness convention, not from a zero
arithmetic column. `witness_maps` admits only actual circuit IDs and
requires witness length to equal the flatten-map length. Unused placements
have neither a selected circuit nor a witness. Therefore the omitted
coordinates always have zero coefficients in U28. Their original points
retain weighted-selection terms and generally are not infinity. Replacing
them is a specialization of the binding sum, not lossless point recovery.
All actual nonpublic wires remain, including constants, interface wires and
wires whose value happens to be zero in an execution. Selection roots, masks,
public specialization and the four-file role boundary remain unchanged.

The candidate layout derives block offsets and retained local wire indices
from existing flatten maps. It adds no per-point descriptors or library
metadata to CRS files. A selected placement/circuit pair is one contiguous
retained range. Empty placements require no query read or identity expansion.

## Measurement procedure

Preserve the dense release binary and output before changing generation.
Repeat full-library setup runs sequentially, without a concurrent build or
benchmark. From `packages/backend/rust`, run the independent storage comparison:

```sh
cargo run --locked --release -p libs --example crs_storage_benchmark -- DENSE_DIRECTORY LIBRARY OUTPUT_DIRECTORY
```

Configure the same ICICLE runtime libraries as the trusted-setup launch entry.
An optional fourth argument, `CANDIDATE_DIRECTORY`, instead compares every
retained query and all other prover sections with the dense archive, and scans
all candidate CRS point families for identity runs. The dense archive is a test
oracle produced at the reference commit, not a supported production format.

The benchmark projects the actual dense archive to A and raw B, then reads
the same selected points and computes the same ICICLE binding MSM. It tests
full, partial and empty placement use with alternating A/B order. Projection
write time is not trusted-setup generation time. First-touch access is not
claimed as an OS-cache-purged cold read. Raw point files are experimental
payloads, not additional production artifact formats. Each candidate gathers
only retained points; B is not penalized by an unnecessary dense MSM.

On macOS the benchmark also performs six alternating range-read trials per
cache mode using `F_NOCACHE` on its own file handles. This requests uncached
I/O; it does not purge the system cache or establish physical-disk coldness.
Range-read timing excludes allocation, point decoding and MSM. Warm mmap
preparation includes selected-point gathering, conversion and allocation.

The full B setup experiment starts with the reference generator and changes
only the nonpublic scalar assignment: use zero when the circuit has no
compiled entry or the local index exceeds its flatten-map length; otherwise
use the original scalar. Full A setup uses the retained-coordinate writer in
this change. Neither candidate adds independent arithmetic or batching tuning.

## Results and disposition

**Accepted: A, direct omission.** It removes 10,694,144 nonpublic points whose
binding coefficients are always zero, retaining 6,006,784 points. Offsets are
derived once from existing library maps; a selected block can be read without
dense restoration. The writer never creates the omitted scalar/point slots.

Measurements were taken on 2026-09-11, on an Apple M4 Pro with 14 logical cores
and 48 GiB RAM, using ICICLE 3.8.0 CPU and release builds. Full setup runs were
sequential and excluded compilation. The [measurement record](evidence/current-univariate-crs-storage.json)
contains repeat timings, hashes, section statistics and access distributions.

| Metric | Dense reference | B: raw identity placeholders | A: omission |
| --- | ---: | ---: | ---: |
| Four RKYV payloads, bytes | 1,983,906,512 | 1,983,906,512 | 957,268,688 |
| Payloads plus provenance, bytes | 1,983,907,281 | 1,983,907,281 | 957,269,457 |
| Setup wall time, seconds | 373.12 / 372.89 | 234.15 | 217.79 / 222.36 |
| CRS generation, seconds | 365.329 / 365.627 | 229.446 | 215.622 / 220.551 |
| Serialize and activate, seconds | 7.164 / 6.555 | 4.138 | 1.637 / 1.615 |
| Peak RSS, GiB | 4.140 / 4.138 | 4.139 | 2.095 / 2.237 |

A reduces total payload size by **51.75%** (1.848 GiB to 0.892 GiB). Its
two-run mean setup time is **220.08 seconds**, compared with **373.01 seconds**
for the dense control, a **41.00% reduction**. These are setup measurements,
not prover timings. B has only one full setup trial; its timing is descriptive,
not a separate repeated-speedup claim.

| File | Dense bytes | A bytes |
| --- | ---: | ---: |
| `tau_sequence.rkyv` | 301,992,400 | 301,992,400 |
| `prover_keys.rkyv` | 1,653,636,880 | 626,999,056 |
| `preprocess_keys.rkyv` | 28,276,128 | 28,276,128 |
| `verifier_keys.rkyv` | 1,104 | 1,104 |

The storage microbenchmark uses full (153,659 selected points), partial
(76,187 points), and empty placement sets. Each of two independent batches
has 30 alternating trials. The following values are medians of the 29 warm
trials, excluding the first touch:

| Selected workload | A preparation + MSM, ms | B preparation + MSM, ms |
| --- | ---: | ---: |
| Full, batch 1 | 12.924 | 12.930 |
| Partial, batch 1 | 7.124 | 7.175 |
| Full, batch 2 | 12.979 | 13.079 |
| Partial, batch 2 | 7.389 | 7.257 |

There is no consistent B access/MSM advantage across these batches; A wins
on size and simplicity, not on a claimed universal MSM speedup. Empty
placements perform neither point reads nor an MSM. In batch 2, per-handle
uncached-request range-read medians were approximately 1.30/1.44 ms (A/B) for
the full selection and 0.54/0.55 ms for the partial selection; cached-request
results and first-touch samples are in the record. These small local-access
tests do not measure downloading, browser heap use, or a cold full-CRS load.

All retained G1/G2 families in both A outputs contained **zero identity
points**, so an infinity-run codec provides no residual saving on this
library. Raw B introduces 11,264 placeholder runs, but it has no stable read
advantage that warrants a second codec experiment. A trial of LZ4 (`-B6`)
increased the retained nonpublic payload from 576,651,264 to
576,653,479 bytes. No run tables, codec dependency, identity expansion,
per-point tags or alternate production representation were added. Other
libraries can have different residual statistics; those require measurement
before introducing a codec.

## Trusted-setup computation follow-up

The storage representation above is the control for a separate compute
experiment. This section does not attribute compression gains to computation.
The compute control is the compressed writer at commit `893c3eb17`.
**Accepted: CPU fixed-base preprocessing and batch normalization, with batches
written directly into the final output array.** The four-file format and all
point coordinates remain unchanged.
Memory use is recorded, but the selection policy imposes no memory cap:
reproducible execution speed determines acceptance.

Opt-in Cargo feature `timing` on `trusted-setup` reuses the existing
backend timing collector. It records scalar construction, each ordered G1/G2
encoding invocation and per-file serialization, hashing and writes. File
tasks overlap; their durations must not be added as serial wall time.

The first repeated release control took 222.33 seconds wall, including
219.894 seconds of CRS generation. Encoding 524,292 G2 tau points took
104.164 seconds; encoding 6,006,784 retained nonpublic G1 points took
79.173 seconds. Scalar preparation was below one second. The second control
took 218.15 seconds wall. These controls preceded candidate comparisons.

The older [native optimization history](../../rust/prove/optimization/publication/optimization-report.md)
supports testing shared preprocessing and bulk work instead of repeated
equivalent operations. Its numeric speedups are not predictions for this
protocol. Direct sparse R1CS evaluation and bounded power recurrence already
exist here. Prover-specific opening combinations, bivariate transforms and
vanishing division do not apply to this setup scalar-label construction.
The candidates were ICICLE one-point MSM batches and CPU fixed-base
table reuse with bounded affine-normalization batches. CUDA dispatch and the
CRS representation remain unchanged. Independent correctness/timing comparisons
preceded production candidate integration. Scalar preparation was below one
second, power construction about 5 ms, and prover-key serialization about
40 ms; no additional scalar/buffer algorithm was adopted without isolated
evidence of an improvement.

The initial independent G1/G2 comparison passed byte equality for zero, one, modulus
minus one and random scalars, including empty and small inputs. CPU ICICLE
one-point MSM batches used default configuration without base precomputation
and were rejected: at 1,024 points G1 took about 792 ms
versus 14 ms direct, and G2 took about 11,657 ms versus 199 ms direct. No
regressing CPU batch implementation was integrated or run at full CRS scale.

At 16,384 points, fixed-base preprocessing with bounded normalization took
about 30 ms G1 and 83 ms G2, versus 217 ms and 3,195 ms direct. Small-input
results were mixed, so integration starts at the measured 16,384-point
boundary and preserves direct encoding below it. The existing arkworks
dependency supplies the arithmetic; no custom curve algorithm is introduced.
CUDA keeps the existing ICICLE bulk path without surrounding Rayon tasks.

The [compute measurement record](evidence/current-univariate-setup-compute.json)
contains all 12 full setup runs, independent encoding samples and seven paired
collection trials. Full runs used the same host, local library, release CPU
configuration and fixed development scalars as the storage experiment.

| Full setup variant | Process wall samples, seconds | Mean wall, seconds | Mean generation, seconds |
| --- | --- | ---: | ---: |
| Compressed control, direct ICICLE arithmetic | 222.33, 218.15 | 220.240 | 217.573 |
| Fixed-base, unindexed temporary collection | 14.24, 14.34, 12.84, 12.19, 14.66 | 13.654 | 10.019 |
| Fixed-base, direct output writes (accepted) | 12.18, 12.21, 12.05, 12.13, 12.51 | 12.216 | 10.089 |

The accepted five-run mean is **94.45% shorter (18.03x)** than the two-run
compute control. These gains are additional to, not interchangeable with,
the storage experiment's compression gains. The last accepted run encoded
the G2 tau family in 1.388 seconds and the nonpublic G1 family in 5.636 seconds,
compared with 104.164 and 79.173 seconds in the first control.

The collection choice has a narrower evidence boundary. Seven alternating
1,048,583-point G1 trials favored unindexed collection in isolation: medians
0.958 seconds unindexed versus 0.979 seconds direct. However, full setup,
including file writes and activation, favored direct output in the repeated
series above (10.53% lower mean wall time). A four-run unindexed/direct/direct/
unindexed crossover is included in those samples. Generation-only averages
do not show a direct-output advantage; the difference is primarily in the
serialization/write phase and remains subject to filesystem variation.
Direct output is selected for observed whole-command speed, not for a claim
that its encoding kernel is universally faster or that lower memory use is
itself an acceptance criterion. Peak RSS was approximately 2.24–2.25 GiB for
direct output and 2.75–2.81 GiB for unindexed collection; there was no imposed
memory cap.

All four files across all 12 runs are byte-identical, totaling 957,268,688
bytes. Every provenance digest matches its payload. The compute change adds
no decompression, reconstruction, consumer indexing, or curve conversion
work at CRS read time. Parallel work uses the runtime's available CPU workers;
the 1,024-point batches and 16,384-point threshold do not fix a core count.

To reproduce the isolated comparisons and instrumented setup, configure the
ICICLE libraries as in the trusted-setup launch entry and run from
`packages/backend/rust`:

```sh
cargo run --locked --release -p libs --example setup_encoding_benchmark
cargo test --locked --release -p libs compare_cpu_output_collection -- --ignored --nocapture
cargo build --locked --release -p trusted-setup --features timing
/usr/bin/time -l ../target/release/trusted-setup --subcircuit-library ../../frontend/qap-compiler/subcircuits/library --output OUTPUT_DIRECTORY --fixed-tau
```

`/usr/bin/time -l` is the macOS measurement invocation. Preserve the control
binary before rebuilding candidates, run them sequentially, and compare all
four file hashes and their provenance. Compilation is excluded. CUDA remains
on its existing ICICLE bulk path; it was not benchmarked in this experiment.

### ICICLE base-precomputation comparison

The initial experiment did not test `precompute_bases`; it did not establish
that arkworks outperforms ICICLE with precomputed bases. A separate follow-up
on 2026-09-11 tested that API on the same release CPU environment. The
[measurement record](evidence/current-univariate-icicle-precompute.json)
contains 124 samples and their correctness results. No production code changed.

The workload produces a vector of separate points `[a_0 G, ..., a_(N-1) G]`,
not their sum. ICICLE receives one shared base, precomputes it using the public
API, and performs N size-one MSMs in one batch call. No outer Rayon tasks wrap
that call. Its output is converted to affine CRS coordinates after the call.
The arkworks candidate reproduces the current large-input encoding path:
one shared table with a 16,384-point sizing hint, 1,024-point parallel chunks,
batch normalization and direct final-array writes.

Each curve/run shares random scalars and one random generator across all
candidates and trials, including scalar values 0, 1 and -1. Every output
coordinate is checked against direct ICICLE arithmetic. Timing includes
precomputation, allocations, scalar conversion, multiplication and affine
output; it excludes input generation, the oracle, equality checks and logging.
The separate stage columns in the record are diagnostic: arkworks includes
normalization in its multiplication stage, whereas ICICLE reports the affine
stage separately. Total time is the comparable metric. Memory has no cap.

At 1,024 points, each configuration ran three times with rotated candidate
order. The tested `(precompute_factor, c)` pairs were `(1,0)`, `(2,0)`,
`(4,0)`, `(8,0)`, `(16,0)`, `(32,0)`, `(4,4)`, `(4,6)`, `(4,10)`, `(16,6)`,
`(32,6)`, `(32,4)`, `(64,4)`, `(128,2)` and `(256,1)`. Here `c=0` requests
the ICICLE default window. The last four pairs first passed a 17-point
correctness screening run. Those single-trial screening times are not used
to select the production path, which retains direct arithmetic for small inputs.

`factor=64, c=4` was the fastest tested ICICLE configuration for both curves
at 1,024 points. Raising the factor to 128 or 256 did not improve that result.
The selected configuration was then compared with arkworks at 16,384 points
for three alternating trials, with a fresh shared input per curve.

| Points | Curve | ICICLE precomputed median, ms | arkworks median, ms | ICICLE / arkworks |
| ---: | --- | ---: | ---: | ---: |
| 1,024 | G1 | 96.878 | 18.105 | 5.35x |
| 1,024 | G2 | 686.372 | 53.840 | 12.75x |
| 16,384 | G1 | 1,532.224 | 29.602 | 51.76x |
| 16,384 | G2 | 11,076.248 | 83.786 | 132.20x |

The 1,024-point table uses paired samples from the extended sweep, not the
earlier default-configuration run. In the separate initial sweep, default
ICICLE medians were 793.140 ms G1 and 11,768.361 ms G2. Precomputation and
window tuning therefore materially improve the measured ICICLE path, but
do not close the gap with arkworks for this workload.

The [ICICLE v3.8.0 CPU source](https://github.com/ingonyama-zk/icicle/blob/v3.8.0/icicle/backend/cpu/src/curve/cpu_msm.hpp)
processes batched MSM outputs successively; each size-one MSM still runs
the bucket-processing stages and their worker scheduling. This structure is
consistent with the observed per-output overhead, not a separately measured
breakdown of its cost. Base sharing alone does not make this the same
algorithm as arkworks' fixed-base vector multiplication and normalization.

**Disposition: retain the current arkworks large-input CPU path.** This is a
comparison of 15 tested ICICLE configurations, not a proof of globally optimal
parameters or a claim about CUDA or other CPUs. No full-CRS ICICLE setup was
run after these slower isolated results; the earlier whole-setup timing and
four-file equality evidence remain unchanged. No new full proof E2E is claimed.

Reproduce from `packages/backend/rust` with the same ICICLE library environment:

```sh
cargo build --locked --release -p libs --example setup_precompute_benchmark
../target/release/examples/setup_precompute_benchmark 1024 3
../target/release/examples/setup_precompute_benchmark 17 1 32:4 64:4 128:2 256:1
../target/release/examples/setup_precompute_benchmark 1024 3 32:4 64:4 128:2 256:1
../target/release/examples/setup_precompute_benchmark 16384 3 64:4
```

## Reuse in prove and MPC setup

### Implementation inventory

The arithmetic implementation is
[`rust/libs/src/univariate_setup.rs`](../../rust/libs/src/univariate_setup.rs).
The following inventory distinguishes newly measured changes from efficient
structures already present in their control. Do not assign a separate speedup
to a component that was not isolated experimentally.

| Mechanism | Implementation | Status and invariant |
| --- | --- | --- |
| Omit implicit-zero nonpublic coordinates | `generate`; [`NonpublicQueryLayout`](../../common/interface/univariate-crs/src/nonpublic_queries.rs) | Accepted storage change. Derive retained ranges from existing flatten maps; do not expand omitted coordinates at read time. |
| Specialize public-buffer queries to placement `i=k` | `generate`, public-label construction | Existing application specialization, retained unchanged. Applies only to public wires of public buffers, not intermediate/private wires or arbitrary placements. Free and fixed public queries retain their distinct encodings. |
| Evaluate scalar labels directly from sparse R1CS rows and Lagrange values | `wire_images`, `lagrange_at`, `generate` | Already in the control. No dense polynomial per CRS query is constructed; this report does not isolate its speedup. |
| Build a power sequence by recurrence | `powers` | Already in the control. Each 4,096-element chunk starts with one exponentiation, then repeated multiplication; chunks run in parallel. |
| Shared fixed-base table and batch normalization | `encode_g1`, `encode_g2`, `encode_fixed_base` | Accepted CPU compute change. Same affine points and ordering as the direct ICICLE oracle. |
| Write point batches into their final array ranges | `encode_fixed_base` | Accepted on whole-setup timing; isolated collection timing slightly favored the alternative. Treat the I/O-related advantage as host-dependent. |
| Concurrent host work and staged artifact output | `stage_artifacts`; [`run_trusted_setup`](../../rust/setup/trusted-setup/src/univariate.rs) | Already in the control. Four role files are serialized/hashed/written concurrently; provenance is written before activation. No partial generation is exposed. |
| Opt-in timing and independent comparison programs | `timing` feature; [`encoding benchmark`](../../rust/libs/examples/setup_encoding_benchmark.rs), [`collection comparison`](../../rust/libs/src/univariate_setup.rs), [`precomputation benchmark`](../../rust/libs/examples/setup_precompute_benchmark.rs) | Measurement infrastructure, not an arithmetic speedup. Preserve total-command timing in addition to component spans. |

### What the accepted CPU encoder actually shares

For a vector `[a_j G]`, all scalar products in one encoding call have the same
base `G`. The encoder constructs arkworks 0.5's
`BatchMulPreprocessing::new(G, 16_384)` once, then shares that immutable table
across calls to `table.batch_mul` on 1,024-scalar chunks. The second constructor
argument selects a table-sizing heuristic; it is not an input-length limit or
a memory cap. The table is currently reused within one encoding call, not
cached across every G1 family or across processes. Cross-call caching is an
unmeasured candidate, not an implemented optimization.

The table supplies precomputed multiples of `G`; `batch_mul` supplies the
fixed-base scalar multiplication and batched conversion to affine points.
The backend supplies chunk scheduling, scalar conversion and output encoding,
not a new curve algorithm. Table reuse and normalization were measured as a
combined change, so their individual shares of the speedup are not known.
Inputs below 16,384 points retain direct ICICLE CPU arithmetic. The cutoff and
chunk size are measured implementation choices, not protocol parameters or a
claim of optimal settings on every host.

The serialized point representation is unchanged: canonical little-endian
affine coordinates, with G2 extension-field components in the existing c0/c1
order and identity points in the existing zero-coordinate representation.
Conversion work happens during generation, not when a consumer reconstructs
the CRS. CUDA retains its ICICLE bulk path. CPU worker counts are selected at
runtime; do not wrap an internally parallel ICICLE bulk call in an additional
parallel loop or derive a fixed worker count from the measurement host.

### Match the next workload before reusing an API

| Operation in the target implementation | Applicable lesson | Boundary |
| --- | --- | --- |
| Many distinct scalars times one known base, producing separate points | Benchmark fixed-base table reuse and batch normalization directly. | This is the setup workload tested here. Include table setup, scalar conversion and final output in timing. |
| A proof commitment `sum_j a_j P_j`, with different CRS bases | Reuse profiling, layout locality and the ICICLE-precomputation experiment method. | This is variable-base MSM, not `[a_j G]`. The result here does not justify replacing that MSM with the setup fixed-base encoder. |
| Repeated commitments using the same list of CRS bases | Test amortized MSM-base precomputation across the actual reuse count. | Count first-use cost separately from warm reuse. The size-one MSM rejection says nothing conclusive about large MSMs. |
| MPC updates `[r_j P_j]` with different incoming points | Test suitable bulk point operations, normalization and output scheduling. | A common participant secret, or related `r_j`, does not make all bases equal. Do not substitute a single-base table. |
| Deriving circuit-dependent keys from public powers-of-tau points | Reuse sparse structure and investigate linear combinations of the available points. | Direct trusted setup knows `tau`; a ceremony consumer does not. Do not port secret-scalar evaluation by recovering, substituting or assuming knowledge of `tau`. |
| Prover reads of compressed nonpublic queries | Use existing placement/circuit ranges and gather only retained points. | Omission requires coefficients to be identically zero for every admitted input, not merely zero in a sample witness. No dense identity expansion is needed. |
| Independent archive serialization, hashing and writes | Reuse concurrent staging and activation ordering where those responsibilities already apply. | Measure total wall time and preserve failure behavior; overlapping task times are not additive. |

The current storage specialization preserves weighted-selection terms for all
retained wires. It does not identify a point as removable merely because its
arithmetic column is zero. Any MPC writer targeting this layout must produce
the retained mathematical queries; this report does not establish that
skipping elements during a ceremony update preserves that ceremony's checks.
Likewise, the development setup's fixed trapdoor controls and publication
ineligibility are not changed by arithmetic reuse or favorable timing.

### Adoption checklist for follow-up work

1. Profile the target command and classify each hot operation using the table
   above. Start with the applicable candidates in this report and the separate
   historical prover report; do not apply an optimization solely because it
   won in trusted setup. Extract a shared helper only when a real second
   caller needs the same operation; prefer existing arithmetic APIs.
2. Build an independent equality test for the candidate before integration.
   Cover zero/one/minus-one scalars, identities, ordinary random inputs,
   batch boundaries and the target's real data ordering. For query omission,
   retain binding equality and the admitted-input justification.
3. Measure release builds with compilation excluded, identical paired inputs,
   repeated rotated candidate order and no concurrent benchmark/build.
   Include allocation, conversions, table construction and transfers. For
   reusable tables, report both cold construction and realistic amortized
   reuse, rather than hiding construction outside every measurement. Record
   memory but impose no memory cap; speed is the selection criterion.
4. Integrate only a demonstrated improvement, one candidate at a time. The
   native-first stage uses independent algebraic tests and repeated complete
   proof generation/timing; preprocess and verifier are not prerequisites.
   Qualify accepted changes against the preserved reference in full E2E once
   those consumers are implemented. For subsequent integrated optimization,
   repeat affected E2E and whole-prove timing after each change. For future
   MPC work, run the target workflow's required contribution/artifact checks;
   setup byte equality alone is not evidence of a valid ceremony.
5. Extend the appropriate new-protocol report with the source commit,
   environment, raw samples, correctness results, accepted/rejected status
   and scope limits after each candidate. Preserve these setup controls and
   do not mix old-protocol timings with new-protocol speedup claims. Retain
   CUDA support without inferring CUDA performance from these CPU results.

## Validation boundary

Storage-stage checks (P3.1) passed:

- Three shared archive/layout tests, the direct setup-equation/binding test,
  and four trusted-setup command/lifecycle tests, all in release mode.
- Dense-versus-omitted binding equality for full, partial and empty selection,
  including rejection of supplied witnesses at implicit-zero coordinates.
- Every retained point in both full-library A outputs equals the dense
  reference. Other prover sections also match. The other three role files
  are byte-identical across all five setup runs; each run's four provenance
  digests match, and repeated A outputs are identical.
- Backend contract generation/closure checks and WASM TypeScript checking.
  The shared archive range reader and generated ordering contract are updated.

Compute-stage checks (P3.2) passed in release mode: two setup tests (the
existing algebra/binding oracle and CPU coordinate parity across the batching
boundary), four trusted-setup command tests, and three shared archive tests.
The ignored collection benchmark was executed explicitly and passed; the
standalone encoding comparison checked every output against direct ICICLE.
Parity includes zero, one, modulus-minus-one, random scalars, small inputs,
partial final batches and identity generators. Full-library checks cover all
four payloads and their provenance, not a complete proof flow.

An additional existing `univariate_relation` test sweep passed three tests and
failed three: `placement_selector_uses_only_real_catalog_ids`,
`connection_selectors_match_the_u5_coset_values`, and
`permutation_admission_rejects_invalid_selector_and_mapping_shapes`. Their
shared fixture sets `l_free=0`, which the current shape constructor rejects
before relation or compression code runs. Both source files are unchanged
from `f276370fc`; this compression change does not repair those fixtures.
The package-wide test suite is therefore **not reported as green**.

Current-protocol native proof generation is implemented; native preprocess
and verifier and the WASM flow still require their planned rewrite. Full E2E,
converter/runtime integration and final integrated storage qualification
remain pending. Old-protocol
consumers are not evidence of compatibility with these new archives. Re-run
the storage comparison if the integrated prover's access pattern changes.

## Historical Pre-Normalized Native Prover Baseline and Selection Interpolation

This baseline predates the normalized library layout. Its aggregate-width
measurements are retained for chronology only and must not be used as current
parameter or performance evidence.

The [native measurement record](evidence/current-univariate-prove.json)
contains all 20 complete command samples, binary/input identities, per-stage
durations, memory observations and isolated experiments. Stage and nested
MSM spans overlap and must not be added together. No outliers were removed.

### Scope and controls

The native reference is `cc05a7450`, with timing-only spans added before
measurement. These runs use release optimization, the ICICLE 3.8 CPU provider,
an Apple M4 Pro (14 logical CPUs, 48 GiB RAM), Darwin 25.5.0 and rustc 1.95.0.
Worker counts are not fixed to this host. No build or test runs concurrently
with a timed proof; ordinary desktop activity is not suppressed. Compilation
is excluded. There is no memory cap and no CUDA benchmark.

The local library has n=m=1,024, m_I=1,024, s=256, t=64, 44 compiled circuits
and l_free=256. The synthesizer fixture has 172 active placements. All trials
use the same compressed trusted-setup generation, library and fixture.
They include normal CRS/library identity checks and fresh proof randomizers.
No release-eligibility bypass or deterministic production masks are added.

The baseline executable is preserved separately before rebuilding candidates.
The two controlled proofs completed in 600.094 and 589.780 seconds (mean
594.937), including 589.390 and 579.156 seconds in selection interpolation.
CRS deserialization took 0.147 and 0.153 seconds; witness/map preparation
took 0.242 and 0.245 seconds. The earlier 598.063-second concurrent smoke
run is excluded from this comparison.

### Accepted: shared selection cofactors

For selected roots z_i, every wire uses the same weighted cofactor
`(z_i / N_S) * Z_v(Z) / (Z - z_i)`. U29 obtains q_j by multiplying those
cofactors by the placement witnesses and summing. The reference instead
recombines the product tree for each wire: at m=1,024 and s=256 this entails
522,240 small polynomial multiplications and 261,120 additions, besides leaf
construction. The shared-cofactor candidate computes the coefficient matrix
once by synthetic division and reuses it across wires.

The candidate uses the existing arkworks field arithmetic and Rayon for host
dot products. ICICLE calls remain outside Rayon loops. It requires O(s^2)
shared cofactor storage (2 MiB at s=256) and O(m*s) assignment/output storage,
not an m*s*t witness grid. Empty assignments contribute zero without changing
the selected-root polynomial or query ordering. Polynomial and MSM CUDA
dispatch remain available, but CUDA performance is unmeasured.

Independent tests passed for s=1,4,16,256, full/partial/empty selectors,
repeated circuit IDs, all-zero wires, random field values and -1. Every
coefficient matches the ICICLE product-tree reference. Three alternating
comparisons using 16 actual fixture wires and all 256 placement slots took
9.213074, 9.270165, 9.199750 seconds for the reference and 0.001702, 0.001278,
0.001395 seconds for the candidate, including cofactor preparation and field
conversion. The shared root tree and input decoding are outside both isolated
timers. These are interpolation timings, not complete-prove speedups.

After integration, all five prover library tests passed, including the
deterministically masked scalar oracle for current commitments, challenges
and openings, fixed/free public inputs, an internal circuit at i!=k,
selection holes, and rejection of invalid copy/arithmetic relations.

| Variant | Complete command samples, seconds | Mean, seconds | Interpolation samples, seconds |
| --- | --- | ---: | --- |
| P5 reference | 600.093561, 589.779525 | 594.936543 | 589.390499, 579.155983 |
| Shared cofactors | 10.527646, 10.538977, 10.627963 | 10.564862 | 0.017705, 0.017554, 0.018355 |

All five complete runs produced the current 10-point/7-scalar proof and
exited successfully. The measured whole-command improvement is **56.31x**.
Peak RSS was 2.047--2.050 GB in both series; process peak memory does not
resolve the small added cofactor/assignment buffers. Cofactor storage grows
quadratically with s; these results do not establish the best interpolation
algorithm at arbitrarily larger placement capacities. The CRS format,
selected query ranges, masks and transcript schedule are unchanged.

**Disposition: accept shared cofactors for native proving.** This is
prover-only algebraic/reference validation and complete proof generation,
not successful native verification or full E2E. Those checks remain pending.
The copy-relation phase then took 2.32--2.35 seconds and was examined next.

### Accepted: ICICLE bulk copy-denominator inversion

Three alternating isolated trials at each of 1, 17, 64, 256, 1,024, 4,096
and 262,144 field elements compared scalar `inv()` calls with ICICLE
`inv_scalars`. All inverses agree, including 1, -1 and random nonzero
values. Bulk calls were slower through 256 elements, but faster in all
measured trials at 1,024 and above. At 262,144 elements, scalar calls took
1.723373--1.745181 seconds and bulk calls 0.170163--0.191556 seconds.
The production path therefore retains scalar inversion below 1,024 and uses
the provider's bulk call above that measured boundary. No host-specific
worker count is introduced and no outer parallel loop wraps ICICLE.

Zero denominators still abort with their first failing index before any bulk
call, and a nonclosing copy recurrence still fails without challenge retry.
The independent recurrence test uses a telescoping cyclic permutation at
n=512,1,024,4,096 and compares the entire masked R polynomial with its analytic
value. It also checks a zero denominator at the last domain element. All six
regular prover library tests pass; the separate inversion benchmark passed
when explicitly selected.

Full runs were interleaved as bulk/control/bulk/control/bulk after preserving
the cofactor-only executable. Bulk command times were 8.868247, 9.008860 and
9.032957 seconds (mean 8.970021); the interleaved controls were 10.495965 and
10.647220 seconds. Copy-relation time fell to 0.720--0.735 seconds. All five
runs generated proofs successfully. Peak RSS remained approximately
2.047--2.052 GB. **Accept bulk inversion at the native-only gate.** Full E2E
and CUDA performance remain unmeasured.

### Rejected: per-proof MSM base precomputation

An independent release test compared three uses of the same xi-source
prefix with no preprocessing and ICICLE factors 2 and 4, rotating candidate
order over three trials at 1,024 and 262,146 points. The three uses model
CL, CH and the xi part of Pi_chi; no shifted commitment is counted as reuse.
Every output point matches. Inputs include 0, 1, -1 and random scalars.
Timing includes table allocation/construction and three MSMs, but excludes
input point decoding shared by all variants.

At 262,146 points, no preprocessing took 0.971--0.985 seconds for three
MSMs. Factor 2 took over 16 seconds and factor 4 over 30 seconds. Table
construction dominates the small multiplication saving. The 1,024-point
results also regress. **Reject these configurations for first-proof use;**
no precomputed-base cache or production precomputation path is added. This is not
a claim about arbitrary reuse counts, other configurations or CUDA. The
setup fixed-base acceleration does not transfer to this variable-base MSM
workload.

### Not adopted: mmap backing for owned archive decoding

Five alternating warm-file comparisons per archive used the same validated
RKYV decoder with `fs::read` and mmap backing. The timer includes opening,
reading/mapping and owned deserialization; byte equality and dropping the
decoded object are outside it. The source is pre-read and remains immutable,
so these are not cold-storage measurements. Every mapped/read byte matches.

After first-touch variation, prover-key decoding took about 68--69 ms with
read backing and 61 ms with mmap. This small isolated difference does not
establish a complete-prove improvement against the observed command
variation. No new mapping lifetime contract or unsafe production reader is
introduced. A zero-copy range-based redesign is a different experiment,
not a result demonstrated by replacing the input buffer here. Existing
compressed query indexing and the P3.1 access pattern remain unchanged.

### Accepted: combine multi-source commitment MSMs

The same-point sums in CL, CH, CD and Pi_chi previously invoked a separate
MSM for each ordinary/xi/psi source. The candidate concatenates the selected
source slices and corresponding scalars, preserving each exponent offset,
then performs one ICICLE MSM per sum. It preallocates the combined buffers;
it does not batch across a Fiat--Shamir round or alter any emitted point.
The independent test compares shifted source slices, zero/one/-1/random
scalars, and source lengths [17,17,17], [262146,262146,262146],
[256,262146,262146] and [0,262146,262146]. All 20 paired comparisons agree
and favor combining. For the three large sources, means were 0.958848
seconds separate and 0.889958 seconds combined, including input gathering.

| Paired run | Control, seconds | Combined MSM, seconds |
| ---: | ---: | ---: |
| 1 | 8.012785 | 7.852285 |
| 2 | 8.101029 | 7.921620 |
| 3 | 8.071576 | 7.972255 |
| 4 | 8.218668 | 7.915508 |
| 5 | 8.138478 | 7.919588 |
| Mean | 8.108507 | 7.916251 |

Every candidate was faster than its adjacent control (2.37% mean reduction),
and all ten commands generated proofs. MSM calls fell from 19 to 12 without
changing the total mathematical terms. The six regular prover library tests
also pass. Peak RSS stayed approximately 2.046--2.052 GB. **Accept the combined
MSMs at the native-only gate.**

The contemporaneous controls were faster than the preceding bulk-inversion
series, despite using the same preserved binary and inputs. Do not attribute
that between-series movement to this change. The original mean of 594.937
seconds and final mean of 7.916 seconds describe the observed endpoints
(about 75x); the paired table isolates the last change. The dominant verified
improvement is the removal of repeated selection interpolation. These CPU
results are not a latency guarantee for other hardware or library shapes.

### Remaining optimization boundaries and reproduction

Before the hardware-separated implementation, the preserved combined-MSM
release binary was rerun three times on the same local library, fixture and
accepted CRS. Complete-command times were 8.577665, 8.910105 and 8.823285
seconds (mean 8.770351); all three commands generated proofs. These remain
ICICLE-centered CPU reference results, not arkworks implementation results,
verification or CUDA coverage. The binary hash, paths and identity/protocol
timing breakdown are recorded in
[`evidence/prover-hardware-split-baseline.json`](evidence/prover-hardware-split-baseline.json).
Keep this series separate from the earlier paired optimization trials; no
candidate was interleaved or compared in this reference-only measurement.

The historical sparse binary R1CS reader, coefficient-domain vanishing
division, source-specific opening aggregation and compact nonpublic range
selection already exist in the P5 reference. No extra speedup is assigned
to them here. Bivariate transform/transpose optimizations do not apply to
these one-variable maps. Outside selection and copy inversion, measured
arithmetic preparation is subsecond; no unmeasured buffer or polynomial
rewrite was added. No production CRS reader, artifact contract, setup,
preprocess, verifier, WASM or MPC code changed in this native experiment.

### Hardware-separated native prover

The default native prover now retains arkworks field and polynomial values
throughout CPU computation. `--device cuda` explicitly selects ICICLE; it
does not fall back to CPU. Both engines execute one U23--U33 schedule and
write the common `univariate_proof.bin` directly from canonical affine/field
bytes. There is no production JSON proof projection. Input-origin selection
and release optimization remain independent of hardware selection.

The CPU implementation uses arkworks MSM, FFT/interpolation, polynomial
multiplication, `divide_by_vanishing_poly`, and batch inversion. It retains
shared selection cofactors and combined-source commitments, with no dense
`m*s*t` witness expansion. Selected CRS records are converted directly to
arkworks points, not through ICICLE objects. The canonical domain contract
pins the existing ICICLE primitive root: arkworks' default root has a
different ordering, so interpolation explicitly uses the contract root.
CPU execution skips ICICLE backend discovery/device initialization, but the
shared native package still links ICICLE libraries.

The ICICLE engine uses its polynomial, MSM and batched vector APIs. Selection
cofactor sums no longer use arkworks host arithmetic on that route. Its
specialized vanishing-division API cannot handle the current blinded degree
greater than twice the divisor degree. The engine therefore retains the
existing exact coefficient recurrence as its primary division algorithm,
with a remainder check, rather than treating an unsupported API result as
a quotient. No CUDA performance claim is made.

#### Controlled full-command comparison

On Apple M4 Pro (14 logical CPUs), both binaries used release builds with
the timing feature, the same accepted CRS, local QAP library and synthesizer
fixture, and fresh proof randomizers. One warmup per binary was discarded.
Five pairs alternated reference/CPU and CPU/reference order. No task-owned
Cargo build or test ran during the measured pairs; normal desktop applications
remained active. No worker-count override or memory cap was imposed. The
reference is the preserved `96f4f2283` ICICLE-centered CPU implementation,
not the superseded protocol or an earlier measurement of the new CPU code.

| Measured interval | ICICLE CPU reference, s | arkworks CPU, s |
| --- | ---: | ---: |
| Complete command (`univariate.total`) | 8.559207 | 5.987615 |
| Identity checks | 1.833102 | 1.808358 |
| CRS loading/admission | 0.154093 | 0.163001 |
| Map preparation | 0.245292 | 0.158918 |
| Proof protocol (inclusive) | 6.283349 | 3.782914 |
| Arithmetic relation | 0.191592 | 0.121679 |
| Public/nonpublic binding commitment | 0.065162 | 0.023685 |
| Selection construction and commitments | 1.013748 | 0.493769 |
| Copy relation | 0.738193 | 0.358443 |
| Openings (inclusive) | 1.280051 | 0.941700 |
| MSM calls summed (nested in protocol intervals) | 4.237836 | 3.101107 |
| Proof output | 0.000263 | 0.000235 |

The complete-command reduction is **30.0%**, or **1.429x** speedup. Reference
samples range from 8.499 to 8.630 seconds; CPU samples range from 5.952 to
6.078 seconds. Independently observed process wall time averages 8.658 and
5.997 seconds respectively, including process startup and teardown excluded
from the internal timer. Keep these metrics separate.

MSM timing excludes input point decoding and includes result normalization;
the CPU span also includes its final 96-byte encoding. Ten CPU MSMs replace
twelve reference MSMs because selection masks join their associated query
MSMs. Parent and child intervals overlap: do not add table rows to reconstruct
the command total. The diagnostic `selection.interpolate` interval also has
different coverage (the new engine includes tree construction), so it is not
used as a directly comparable row. The timing test labels its category sums
as inclusive and no longer subtracts overlapping sums to infer ingress time.

The protocol interval accounts for about 2.500 seconds of the 2.572-second
command reduction; identity checks and serialization account for little of
the difference. These are measurements of the complete implementation
change, not isolated causal estimates for each arkworks API or mask fusion.
CRS loading is slightly slower in this series; the command nevertheless
improves beyond observed sample variation. Earlier 7.916-second optimization
results and the 8.770-second reference-only series remain separate evidence.
All samples, events, binary hashes, input hashes and arguments are in
[`evidence/prover-hardware-split-comparison.json`](evidence/prover-hardware-split-comparison.json).

#### Validation boundary at the hardware-split checkpoint

- Nine prover library tests and the default/explicit device CLI test pass in
  release mode; four optional benchmark tests remain ignored. Fixed-mask
  cases compare maps, selection coefficients, all proof bytes and challenges
  across arkworks, the ICICLE engine on its CPU provider, and the test-only
  accepted reference. Cases include free/fixed public wires, padding, unequal
  arithmetic/connection domains, empty slots, singleton domains, invalid
  witnesses, repeated public buffers and copy failures.
- All six F4 preimages and seven scalar challenges match the independent
  fixture on both field implementations. Contract tests (20 Node tests,
  four Rust interface tests and the TypeScript codec assertions) pass; five
  actual native binary proofs round-trip through the common TypeScript codec.
- CPU commands succeed with a nonexistent ICICLE backend discovery directory.
  The developer timing-test entry also generates a binary proof from the real
  local fixture with that directory absent; its direct-library timer excludes
  CLI identity checks and must not be compared with whole-command time.
  Explicit CUDA selection on this non-CUDA host fails without writing a proof.
  ICICLE CPU-provider parity is not a CUDA functional run.
- At that checkpoint a broader `libs` univariate run was **not green**: 15 tests passed, nine failed
  and one benchmark is ignored. Eight failures use existing `l_free=0`
  fixtures rejected by the existing domain guard; one uses stale catalog
  capacity. Those unchanged fixture assumptions predate this hardware split
  and were assigned to the native consumer migration. The then-unfinished
  verifier still referenced retired proof/challenge fields and did not compile.
  These were subsequently resolved by native preprocess/verifier work; see
  [current validation status](#current-input-modes-and-validation-status).

This closes native proof-generation and CPU-timing checks, not full protocol
verification, browser runtime interoperability, or package-wide validation.
It did not establish later native verification or the still-pending full
native/WASM matrix; their scopes must remain separate.

### Reproducing native checks

From `packages/backend`, build before running comparisons. The default feature
selects local QAP output; `--subcircuit-library` can select the matching local
library directory. Release optimization does not select npm inputs. Configure
native libraries for the host; the example below is specifically macOS.

```sh
cargo build --locked --release -p prove --features timing
cargo build --locked --release -p libs --example selection_interpolation_benchmark
```

With the platform's ICICLE environment configured, the isolated checks are:

```sh
cargo test --locked --release -p libs --test univariate_math
cargo test --locked --release -p prove --lib --features timing
target/release/examples/selection_interpolation_benchmark LIBRARY FIXTURE 16
cargo test --locked --release -p prove --lib --features timing compare_copy_denominator_inversion -- --ignored --nocapture
PROVE_BENCH_TAU=TAU_FILE cargo test --locked --release -p prove --lib --features timing compare_reused_msm_precomputation -- --ignored --nocapture
PROVE_BENCH_TAU=TAU_FILE cargo test --locked --release -p prove --lib --features timing compare_commitment_sum -- --ignored --nocapture
PROVE_BENCH_TAU=TAU_FILE PROVE_BENCH_KEYS=PROVER_KEYS_FILE cargo test --locked --release -p prove --lib --features timing compare_archive_read_backing -- --ignored --nocapture
PROVE_BENCH_KEYS=CRS_DIRECTORY cargo test --locked --release -p libs --features timing compare_validated_read_reuse -- --ignored --nocapture
```

Preserve each control binary before rebuilding the candidate. On macOS,
pass the library environment after `/usr/bin/time`, since its protected
launcher can strip inherited `DYLD_LIBRARY_PATH`:

```sh
/usr/bin/time -l env DYLD_LIBRARY_PATH="$PWD/external-lib/mac/lib" ICICLE_BACKEND_INSTALL_DIR="$PWD/external-lib/mac/lib/backend" target/release/prove --device cpu --subcircuit-library LIBRARY --tau-sequence TAU_FILE --keys CRS_DIRECTORY --synthesizer-stat FIXTURE --output OUTPUT_DIRECTORY
```

`TIMING_JSON` is emitted only with the timing feature. Complete-command
measurements include the selected identity mode, loading, maps, proving and
writing the proof. The command above uses default digest-disabled CPU mode;
append `--check-digests` only for a declared digest-enabled comparison and use
the same mode for both binaries. Do not combine it with the development bypass.
Commands use fresh randomness; scalar-oracle tests use fixed test masks.
Proof-generation success does not establish verification success. Native
verification is now implemented, but full cross-runtime/reference qualification
remains pending. Build a verifier with the matching fixed keys before verifying
a newly generated proof; do not add verifier time to a prove-only measurement.

## P13: additional native CPU optimization experiments

This section records experiments for backend performance maintainers. They
retain the protocol, four CRS files and binary proof. P13.0/P13.1a/b used
digest-enabled ingress; P13.2--P13.5 and the final comparison used the later
default digest-disabled policy on both binaries. Their acceptance gate was
native proof generation and independent algebraic checks. Later native
verification and pending cross-runtime qualification are summarized above.

### P13.0: detailed timing and preserved control

Preserved the original release binary and added timing-only read/hash/decode,
copy-relation and labeled commitment spans. A separate diagnostic invocation
reports scalar counts only; its timings are not benchmark samples. Nine
regular prover tests passed, including cross-engine proof-byte/scalar-oracle
checks; four opt-in benchmarks were not run as unit tests.

Five alternating-order pairs after one discarded warmup per binary measured
5.998011 seconds for the original command and 5.995265 for the instrumented
command. The approximately 0.05% difference is noise, not an optimization.
Peak resident memory was approximately 3.13 GB. Compilation and simultaneous
task-owned builds/tests were excluded; ordinary desktop applications remained
active. Release optimization and default Rayon parallelism were used.

| Instrumented interval | Mean seconds | Interpretation |
| --- | ---: | --- |
| Identity file reads | 0.090505 | Sum across separately labeled files |
| Identity SHA-256 | 1.664105 | Dominant identity cost, not polynomial work |
| Library identity | 0.037655 | Separate from CRS hashing |
| CRS rereads | 0.062184 | Tau and prover keys together |
| CRS decoding | 0.103170 | Tau and prover keys together |
| Commitment gathering | 0.020489 | Includes binding |
| Commitment point decoding | 0.093428 | Before MSM |
| MSM | 3.117050 | Nested within protocol and commitment spans |
| Copy denominators / inversion / recurrence | 0.020584 | Three disjoint subspans |
| Copy interpolation | 0.012708 | Excludes its subsequent polynomial products |
| Copy-boundary quotient | 0.098729 | Actual P13.2 target |
| Other copy products and coefficient shifting | 0.228004 | Not all copy time is boundary work |

Do not sum these rows with their inclusive parent intervals. The independent
count-only run found all scalars nonzero in seven commitments. D_Q and D_QK
each had 1,280 zero scalars out of 262,401; C_O had 47,991 zeros out of 78,190.
Zero filtering therefore has a small target outside the binding commitment,
not a demonstrated opportunity to remove most of the 3.117-second MSM sum.

Evidence: [paired samples](evidence/prover-p13-instrumentation.json),
[count-only diagnostics](evidence/prover-p13-scalar-counts.json), and
[archived prior retiming](evidence/prover-retiming-before-p13.json).
The reusable runner is `rust/prove/optimization/compare-release.mjs`, invoked
from `packages/backend` with control binary, candidate binary and output
directory. It records fresh randomizers, hashes, nested spans and peak RSS.

### P13.1a: accepted independent-file SHA-256 parallelism

In the measured digest-enabled path, the same three file digests are computed
in the default Rayon pool, then
checked in their original order. SHA-256 bytes and the first reported
missing-file/mismatch error are unchanged. No input check was removed.
The new ordered-admission test passes for valid, corrupt and missing files,
including an earlier mismatch followed by a later missing file.

The independent release comparison (three retained trials after warmup)
measured serial 1.673004 / 1.662954 / 1.667188 seconds and parallel
1.133705 / 1.132588 / 1.136631 seconds. All digests matched. Its reproducible
test is `compare_parallel_univariate_hashes` with `PROVE_BENCH_KEYS` pointing
to the accepted local CRS directory.

Five alternating full-command pairs averaged **6.061472 seconds control and
5.474284 seconds candidate (9.69% reduction)**; every pair favored the
candidate and every run produced the common binary proof. Identity wall time
fell from 1.800685 to 1.237693 seconds. Peak RSS remained approximately
3.13 GB. The last control was slower than earlier controls, so the reported
mean is not an exact isolated estimate of hash savings. The independently
measured hash reduction and every paired result support acceptance.

Per-file hash/read spans now overlap across threads: their sums are work
durations, **not elapsed identity time**. Compare `univariate.identity` for
latency. No protocol arithmetic changed; full E2E remains P8.
Evidence: [whole-command pairs](evidence/prover-p13-parallel-hash.json).

### P13.1b: accepted reuse of validated CRS bytes

With `--check-digests`, the validator returns owned tau/prover-key bytes after checking the same
three file digests and library identity. The CLI decodes those exact buffers,
then drops them; it does not reopen those paths. The explicit development
bypass and direct library entry point retain their ordinary file ingress.
There is no persistent cache or new CRS representation.

An independent hash/read/decode comparison measured, in retained trial order,
reread 1.241684 / 1.246498 / 1.254700 seconds and reuse
1.186961 / 1.232645 / 1.191126 seconds. Every decoded archive reserialized
to identical bytes, checked by full output hashes outside the timed interval.
The test is `compare_validated_read_reuse`, using `PROVE_BENCH_KEYS`.
New tests also check retained original bytes after a path is overwritten,
malformed tau/key rejection and exact owned-decoder round trips in the existing
small protocol oracle fixtures. Eleven regular library-admission tests and
nine regular prover tests pass; opt-in benchmarks are reported separately.

The first five full-command pairs were marginal: 5.452973 seconds reread
versus 5.430499 reuse. A second five-pair series measured 5.472115 versus
5.390867 seconds. Across all ten pairs, means are **5.462544 versus 5.410683
seconds (0.95% reduction)**; eight pairs favored reuse. No samples were
discarded beyond the declared warmups. Both series show the reread/decode
interval falling from approximately 0.165 to 0.103 seconds, while protocol
timing varies. This is a small input-path improvement, not a faster MSM.
Peak RSS remains approximately 3.13 GB. The binaries differ only in this
candidate relative to the already accepted parallel-hash control.

Evidence: [first series](evidence/prover-p13-read-reuse-first.json) and
[repeat series](evidence/prover-p13-read-reuse-repeat.json).
Preserve this independent comparison rather than subtracting means from
unpaired historical timing runs to estimate the combined gain. Full native
verification and WASM interoperability remain untested until P8.

### P13.1c: SHA-256 acceleration experiment excluded

Local source and `cargo tree --locked -p prove -e features -i sha2` show
sha2 0.10.9 with `default` and `std`, without `asm`. In this pinned version,
`sha256.rs` selects its ARM hardware backend only under
`all(feature="asm", target_arch="aarch64")`; otherwise this ARM build uses
the software backend. Its ARM backend performs runtime SHA2 feature detection.
This finding explains the selected implementation, not a measured speedup.

Enabling `sha2/asm` also enables its optional `sha2-asm` dependency (declared
0.6.1), absent from the current lockfile. The authorized plan prohibits new
dependencies. This is an available candidate requiring a scope decision,
not an absence of any acceleration API and not a failed performance trial.
No dependency, feature, lockfile, vendored crypto code or hash algorithm has
been changed to bypass that boundary. The experiment was explicitly excluded
on 2026-09-12. P13.2--P13.5 proceed without it. Default prove no longer performs
payload or library-content digest verification; subsequent comparisons use
that same default mode for both control and candidate.

### P13.2: accepted cancellation in the copy-boundary quotient

Cancel `X^n-1` using `L0=(X^n-1)/(n*(X-1))` before computing
`q0=(r-1)/(n*(X-1))`. Synthetic division retains the exact zero-remainder
check and all blinded coefficients. Both engines use their native field
types; this does not add an arithmetic dependency or change the transcript.

Independent tests cover constant, small, full-size and blinded polynomials,
invalid remainders, and both arithmetic engines. The existing deterministic
proof/challenge parity tests pass against the unchanged reference schedule.
At `n=262144`, the five retained primitive samples average 102.18 ms for the
control and 2.00 ms for the candidate. Five alternating full-command release
pairs improve in every pair: mean process wall time falls from 4.2731 s to
4.1700 s (2.41%). One warmup per binary is excluded. Default digest-disabled
mode, local QAP inputs, fresh randomizers and the same four-file CRS were used
throughout; compilation and other task-owned tests were not concurrent.

The production change is accepted at the native proof-generation gate, not
verified E2E. P8 must requalify it after the consumers exist. Raw inputs,
binary hashes, timings and RSS are in
[the boundary experiment evidence](evidence/prover-p13-boundary.json).

### P13.3: accepted CPU zero-scalar filtering

The CPU MSM path checks length, leaves all-nonzero input unfiltered, and
otherwise gathers only nonzero pairs before affine decoding. Empty input
returns the identity through the existing MSM. Ordering, fused commitments,
CRS storage and GPU arithmetic are unchanged. No catalog IDs or witness-size
thresholds select this behavior.

Independent controls use actual CRS points with synthetic scalars matching
the measured commitment counts: 30,199/78,190 and 261,121/262,401 nonzero,
plus dense and small/all-zero inputs. They are distribution experiments,
not captured witness values. Full timing uses the real local witness.
Small tests include identity/duplicate bases and zero/one/minus-one scalars;
deterministic CPU/ICICLE/reference proof parity also passes.

The first five full-command pairs averaged 4.2275 s versus 4.1512 s (1.80%
improvement, four pairs faster). A second five-pair series averaged 4.3570 s
versus 4.1958 s, with all five pairs faster. The second control includes a
4.8186 s outlier, retained in the evidence; its median comparison is the more
conservative 4.2552 s versus 4.2001 s (1.30%). Acceptance rests on both series,
not the outlier-inflated mean. Dense-only kernel samples fluctuate slightly
against the candidate, so this is a measured full-workload win, not a claim
that filtering accelerates every scalar distribution. P8 qualification is
still required. Evidence: [first series](evidence/prover-p13-filter-pairs.json),
[repeat](evidence/prover-p13-filter-repeat.json).

### P13.4: accepted smaller signed windows and half-range buckets

The independent kernel uses arkworks field/group operations, signed digits
and dynamic Rayon window parallelism. Compared with stock arkworks, its
input-size heuristic selects one fewer window bit and allocates only the
signed half-range of buckets in nonfinal windows. The final window retains
the carry and uses the full range. No fixed local thread count, base
precomputation or cross-proof state is involved.

The test-only sweep covers neighboring widths, scalar-major versus
window-major digits, dense and 40%-nonzero input, 64/30,199/262,148/524,548
bases, and identity/duplicate points with zero/one/minus-one and random
scalars. Every result equals stock arkworks. At 262,148 dense bases the
selected kernel averages 211.29 ms versus 230.15 ms; at 524,548 it averages
381.67 ms versus 417.95 ms. Transposition and wider windows are not retained.
The existing unsigned bounded-window rejection remains a separate experiment.

Five full release pairs, after excluded warmups, improve in every pair:
4.1913 s to 3.8691 s mean process wall time (7.69%). This comparison starts
from the accepted boundary and zero-filter changes. All regular native prover
tests, including deterministic reference/CPU/ICICLE proof and challenge
parity, pass. This is a native-only acceptance, pending P8 full E2E.
See [kernel evidence](evidence/prover-p13-msm-kernel.json) for samples,
recoding/bucket intervals, binary/input hashes and memory observations.

### P13.5: per-invocation memory experiments

Independent experiments use real CRS records and synthetic repeated,
shifted, partially overlapping and disjoint ranges, at 64 and 262,148 points.
Checks compare every gathered record/scalar and decoded affine point. Timing
includes cache/scratch construction, lookup, copying and disposal within one
invocation; no persistent state or MSM time is credited to the primitive.

Scratch gather reuse is rejected as marginal and inconsistent: the large
repeated-range case is 2.333 ms versus 2.137 ms, shifted is 2.412 ms versus
2.316 ms, and partial overlap is 1.814 ms versus 1.838 ms. These sub-millisecond
differences do not justify production scratch-state plumbing. No scratch
gather reuse is integrated.

Range decoding reuse is independently promising: 22.224 ms versus 8.708 ms
for repeated prefixes, 26.030 ms versus 15.257 ms for shifted/reused ranges,
and 18.617 ms versus 14.840 ms for partial overlap. Disjoint input loses
(18.399 ms versus 20.855 ms), so whole-command qualification must include
misses and retained memory. See [memory primitive evidence](evidence/prover-p13-memory-primitives.json).

The full-command cache candidate is rejected. Five release pairs average
4.0129 s uncached versus 4.0346 s cached (0.54% slower); four pairs lose.
The candidate retained only requested nonzero ranges, reused containing
prefixes, distinguished source identity and offsets, and scoped storage to
one proof invocation. It also gathered decoded points per source rather
than raw bytes, so these results describe that complete cache integration,
not an isolated lookup cost. Construction/misses and copies are included.
Mean peak RSS is 2.7234 GB versus 2.7263 GB; memory is not a rejection criterion.
Range tests and deterministic proof parity passed, but correctness alone
does not justify integration. All temporary cache types and Engine-context
changes were removed. The existing stateless engine boundary is retained.

See [full-command samples](evidence/prover-p13-affine-cache.json) and the
[rejected source patch](evidence/prover-p13-affine-cache.patch). The patch is
an experiment record against the accepted P13 source, not production code;
apply it with `git apply --unidiff-zero` only in an isolated comparison
checkout. P13.5 is complete with
both memory candidates rejected, without combining them.

### P13 final native-only qualification

The accepted production set is copy-boundary cancellation, CPU zero-scalar
filtering and the signed-window MSM kernel. SHA acceleration is excluded;
scratch gather reuse and affine caching are not present in production.

A fresh five-pair release comparison directly compares the pre-P13.2 binary
at `55029af4d` with the final accepted implementation, rather than adding
improvements from different runs. Every retained pair improves. Both use
default CPU execution, digest checking disabled, the same current local-QAP
fixture/CRS and new OS-generated randomizers per invocation. One warmup per
binary is discarded. Ordinary desktop background activity is uncontrolled.

| Measurement | Control | Accepted |
| --- | ---: | ---: |
| Mean process wall time | 4.3237 s | 3.8604 s |
| Mean instrumented total | 4.3088 s | 3.8470 s |
| Protocol interval, inclusive | 3.8862 s | 3.4443 s |
| Sum of MSM intervals | 3.1944 s | 2.8449 s |
| Copy-boundary interval | 101.579 ms | 2.934 ms |
| Mean peak RSS | 3.130 GB | 2.723 GB |

Mean wall time improves 10.71%. The protocol, MSM and boundary rows are
nested; they must not be added. Memory is observed, not capped or used as an
acceptance target. All runs produce 1,184-byte proofs with zero payload SHA
events. Twelve regular library tests and one CLI test pass; six experiment
tests are deliberately opt-in. The new protocol's native/WASM verifier E2E
remains P8, so successful generation is not reported as verified proof.

[Final paired evidence](evidence/prover-p13-final.json) records raw timing
events, source/input/binary hashes and per-run RSS. Reproduce with the listed
binary arguments in `packages/backend`, the configured ICICLE installation,
release `prove --features timing`, one excluded warmup per binary and five
alternating-order pairs. Do not compare these default-mode samples directly
with historical always-on-digest timings.

## Native preprocess: initial release baseline

This 2026-09-12 checkpoint is for backend engineers qualifying the current
circuit-admission implementation. It is not an optimization comparison with
the superseded protocol, a CUDA benchmark, or a full proof-verification result.
Native preprocess is now implemented; native verify and the WASM rewrite
remain pending. Earlier statements in this report about unfinished preprocess
describe their historical checkpoints.

The command reads only `preprocess_keys.rkyv` and common provenance from the
CRS directory. Library metadata, selector, permutation and public instance
provide the circuit inputs. It computes `S_C`, `E_kappa` and `C_fix`, then writes
the common 384-byte binary output. The [native reference](../../rust/preprocess/README.md)
describes the exact input, hardware and encoding boundaries. CPU uses arkworks
polynomials and stock G1/G2 MSM APIs. ICICLE is selected only through explicit
CUDA dispatch. No prover-specific MSM optimization was assumed optimal for
preprocess, and no new performance candidate was accepted in this checkpoint.

### Measurement

The final binary was built with `cargo build -p preprocess --locked --release`
and the default local-QAP feature. The host was an Apple M4 Pro with 14 logical
cores; production code does not fix this worker count. One warmup was excluded
before five serial measurements. Normal desktop background activity was not
controlled. No memory limit was applied.

The input CRS directory was isolated to contain only the 28,276,128-byte
preprocess key archive and its 984-byte provenance. It was copied from the
existing current-protocol trusted-setup output, not regenerated. Each command
used the current local-QAP library and `tmp/current-local-fixture` and ran
with `ICICLE_BACKEND_INSTALL_DIR=/nonexistent`; the loader path still supplied
the executable's linked ICICLE shared libraries. CPU execution did not discover
or initialize an ICICLE backend. Metadata identity validation stayed enabled;
publication eligibility and bulk payload digests were not runtime gates.

| Measurement | Five-run mean |
| --- | ---: |
| Instrumented command interval | 0.371348 s |
| Process wall time (`time -l`) | 0.374 s |
| Input read and archive decode | 0.007373 s |
| `S_C` interpolation and G1 MSM | 0.223022 s |
| `Z_u` construction and `E_kappa` G2 MSM | 0.139297 s |
| `C_fix` G1 MSM | 0.000512 s |
| Peak RSS | 229.0 MB |

The command interval ranges from 0.364760 to 0.379319 seconds. Its total also
includes metadata/shape admission and output handling, so the listed sections
do not exhaust it. Process wall time includes startup and shutdown and has
the external timer's 0.01-second resolution. These are baseline observations,
not a claimed speedup. The final output hash was
`13baed2db3479b1ac5d1c0d06e0a183ea0c49f9e305959b75e03cb69b8ca5ebb`.

[Raw samples and reproduction evidence](evidence/preprocess-p4-baseline.json)
include commands, source/input/binary hashes, the excluded warmup and all
five samples. Evidence hashes were calculated separately, outside timed runs.

### Correctness and remaining coverage

Five preprocess library tests and one CLI test pass under default features
and with `development-crs-bypass`. Independent Lagrange evaluation and direct
unselected-root products check `S_C` and `E_kappa`; direct group arithmetic
checks `C_fix`. Tests compare arkworks with the local ICICLE **CPU** backend,
including full/partial/empty selection polynomials, G1/G2 bytes and identity
outputs. They also cover fixed/free separation, malformed circuit admission,
canonical coordinate bounds and truncated archives.

The shared univariate sweep passes 27 tests, with two opt-in experiments
skipped; this is a scoped sweep, not a whole-workspace test result. Previously
stale l_free, m_D, t, domain and minimum-capacity expectations were updated
without weakening production checks. The retired selector-commitment helper
and its dedicated test were removed. Prove regression passes 12 library tests
and one CLI test, with six performance experiments skipped.
Four additional univariate-math and three shared artifact-encoding integration
tests pass as well.

Explicit CUDA selection on this Mac fails with `CUDA was requested but is
unavailable`, returns a failing exit status and produces no output. This is
failure-path coverage, not CUDA arithmetic execution coverage. No CUDA timing,
production npm execution, MPC, publication or package version change occurred.
At this preprocess checkpoint the verifier rewrite was still pending. It has
since removed the old configuration/S_kappa dependency and passed the scoped
native qualification linked above. Full native/WASM cross-verification and
storage/reference requalification remain pending.
