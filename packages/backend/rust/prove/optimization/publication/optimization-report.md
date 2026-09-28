# Tokamak zk-EVM Proving Performance Report

> Status: 3.0.0 publication summary followed by a clearly marked historical
> appendix. The current-protocol report contains the full evidence ledger; this
> document presents the externally comparable results without treating
> superseded-protocol experiments as current release evidence.
>
> Last consolidated: 2026-09-23.

## 3.0.0 Release-Line Summary

The 3.0.0 circuit and interface reductions reduce the amount of constraint and
boundary data processed during proving. The measured browser result is a
release-line comparison; the native result below is explicitly a development
comparison because the published 2.1.5 release does not preserve the locked
native dependency graph needed for an auditable baseline.

| Execution path | 2.1.5 reference | 3.0.0 candidate result | Change |
| --- | ---: | ---: | ---: |
| Browser WASM `transferNotes1To2` | 126.717 s | 18.812 s | 107.905 s faster (85.2%, 6.74x) |
| Native Rust release-profile development comparison | 38.000077 s* | 11.058532 s* | 26.941545 s faster* (70.9%, 3.44x)* |

`transferNotes1To2` transfers one private note into two output notes. Browser
timers cover proof generation only and use five-sample means; proofs were
accepted by the matching browser verifier, and the 3.0.0 candidate proofs were
also accepted by the native release verifier. The browser evidence is recorded
in the [current-protocol report](../../../../docs/optimization/current-univariate-crs.md)
and its [machine-readable samples](../../../../wasm/docs/optimization/evidence/3.0.0-browser-release-comparison.json).

\*The native row is a historical development experiment, not a published
2.1.5-to-3.0.0 release comparison. Its source, lockfile and CRS identities are
documented in the historical appendix below and must not be presented as
release-admission evidence.

The documented cause of the improvement is the reduction in circuit size and
public/interface boundaries: the principal constraint grids changed from
1,048,576 to 262,144 cells (-75.0%), `l_D` changed from 4,824 to 1,420
(-70.6%), and the final public boundary changed from 728 to 396 wires
(-45.6%). These structural reductions explain the direction of the result but
do not assign every saved second to one implementation change.

The remainder of this document is a historical appendix for the superseded
protocol and earlier optimization experiments. Its measurements are retained
for auditability, not as current 3.0.0 claims.

## How To Read This Report

This report separates three kinds of evidence:

- **Current accepted reference**: a measurement of code that remains accepted in the repository.
- **Comparable milestone**: a before/after measurement on the same benchmark sequence. These rows establish a performance improvement.
- **Historical or provisional result**: useful diagnostic evidence that must not be presented as the current result because the setup differs or the measured stack included a later-reverted experiment.

`total wall` is end-to-end proving elapsed time. Lower is better. Component timings are diagnostic only and must be compared only when their timing boundaries match.

The historical appendix uses internal circuit-size counters: `n`, `l_D`, `l`,
`m_I`, and `s_max`. They describe constraint, wire-boundary, and placement
dimensions rather than consumer-facing API values. `MSM` means multi-scalar
multiplication, and ICICLE is the arithmetic backend used by the native
measurements. The appendix retains these terms to identify the measured
structural changes; the reader-facing result is the reduction in circuit and
interface data described above.

## Release Comparison Status

No native 2.1.5-to-current timing is published in this report. The exact
2.1.5 source and its published CLI retain neither an immutable backend Cargo
lock nor a release binary. An unlocked rebuild would not identify the released
native dependency graph, and a comparison against a non-release branch is not
a substitute.

The native values below are retained only as a historical development
experiment. They are not a 2.1.5 release comparison and must not be cited as
one. The audited release-line comparison is the browser-WASM
`transferNotes1To2` measurement in the
[current-protocol report](../../../../docs/optimization/current-univariate-crs.md#release-line-comparison-status).

| release line | release-profile proof samples | arithmetic mean |
| --- | --- | ---: |
| `2.1.5` (`7b9495379`) | 38.028825 s, 37.977969 s, 37.884700 s, 38.268852 s, 37.840041 s | **38.000077 s** |
| `3.0.0` candidate (`f8cd7f78c`) | 11.042374 s, 11.089024 s, 10.995898 s, 11.060470 s, 11.104894 s | **11.058532 s** |

The historical development experiment observed a **26.941545 s (70.9%)**
decrease, or a **3.44x** speedup.
One complete run per release line was discarded before the five retained
first-proof samples. No retained outlier was removed. Every retained run wrote
a proof after the timed boundary, and the matching release verifier accepted
that proof.

### Historical development component detail

| compatible timing boundary | `2.1.5` mean | `3.0.0` candidate mean | decrease |
| --- | ---: | ---: | ---: |
| Initialization | 5.291987 s | 1.112987 s | 4.179000 s (79.0%) |
| Polynomial work | 11.509614 s | 3.788643 s | 7.720971 s (67.1%) |
| Encoding/MSM | 20.244714 s | 5.740524 s | 14.504190 s (71.6%) |

The principal structural cause is the reduction of the constraint and
interface boundaries. `n` and `m_I = l_D - l` both changed from 4,096 to 1,024,
so the `n x s_max` and `m_I x s_max` grids changed from 1,048,576 to 262,144
cells (-75.0%). `l_D` changed from 4,824 to 1,420 (-70.6%), and `l` changed
from 728 to 396 (-45.6%). `s_max` remained 256. The same logical operation used
234 placements under `2.1.5` and 207 under the candidate. The private wire
region increased from 21,767 to 22,659 wires (+4.1%), so the report does not
attribute every saved second to a uniformly smaller artifact.

### Historical development identity and limits

- Host: MacBook Pro, Apple M4 Pro, 14 CPU cores, 48 GB memory, macOS 26.5.2
  (build 25F84). Both lines used the ICICLE CPU fallback.
- Toolchains: Rust and Cargo 1.95.0; Node 24.20.0 and npm 11.19.0 for the
  release-specific Synthesizer inputs.
- Native commands: `cargo test --release` for `2.1.5` and
  `cargo test --locked --release` for the candidate, both with the timing
  feature and matching release inputs. Proof serialization and verification
  ran outside `total_wall_ms`.
- The `2.1.5` release commit did not retain its backend Cargo lock. The
  reproduction generated a compatible lock with SHA-256
  `d32aa3270b8773893b7d54224ee17e7e978194043ce1c0587202342e50ed039c`.
  The candidate used the tracked lock with SHA-256
  `9a160426c3469fa3633f8f98320e5837f0a83d71a3b94c61b80efc3c291203b8`.
- The baseline combined CRS SHA-256 is
  `750c26922a39568a68101501668b496b32938349afc3faa221f6dc929fc6d9a9`.
  The candidate combined development CRS SHA-256 is
  `c40c3bab9bcf1568c8380958e0ac791ad9da9b5f42ebbe86251caa1baae048c4`.
  The candidate CRS has the correct circuit shape but is not a final
  release-eligible `3.0` ceremony artifact.
- The representative current single-run record is
  [`timing.local.cpu.current.json`](../timing.local.cpu.current.json). These
  historical development samples are not release evidence.

These are observations for one host and logical operation. They are not a
portable performance guarantee, and they do not isolate other implementation
differences or system variation from the circuit and boundary changes.

## 2.1.5 Historical Reference

| execution path | status | total wall | key observation |
| --- | --- | ---: | --- |
| Local CPU fallback | final retained `2.1.5` snapshot | **37.077365 s** | `init` 4.982260 s, polynomial work 11.167150 s, and encode 20.031351 s. |
| Remote CUDA | historical scale reference only | 23.758035 s | The latest retained CUDA comparison predates the final CPU-only production sequence; do not treat it as a current accepted CUDA baseline. |

The next remote CUDA measurement must run the release candidate before this
report publishes a current CUDA reference. The CPU row above remains a
historical `2.1.5` snapshot and is not the controlled comparison aggregate.

## At-A-Glance CUDA Improvement History

The following sequence used the same current benchmark setup for the remote CUDA investigation. Rows marked **significant** are the largest accepted improvements and show the date and reason for the improvement at a glance.

| date | milestone | total wall | change from preceding comparable milestone | status |
| --- | --- | ---: | ---: | --- |
| 2026-04-30 | Initial CUDA baseline | 62.418158 s | — | baseline |
| 2026-04-30 | **Significant — sparse uvwXY generation** | 39.731573 s | -22.686585 s (-36.3%) | accepted |
| 2026-04-30 | **Significant — binary sparse `.r1cs` preload** | 32.728363 s | -7.003210 s (-17.6%) | accepted |
| 2026-04-30 | `s0/s1` permutation-power cache | 31.712050 s | -1.016313 s (-3.1%) | accepted |
| 2026-04-30 | **Significant — coefficient-domain vanishing division** | 28.910223 s | -2.801827 s (-8.8%) | accepted |
| 2026-04-30 | Algebraic polynomial-combination rewrites | 27.490122 s | -1.108455 s (-3.8%) | accepted |
| 2026-04-30 | Special-form polynomial products | 26.709146 s | -0.780976 s (-2.8%) | accepted |
| 2026-04-30 | Column-batch biNTT | 21.487536 s | -0.655386 s from its historical experimental predecessor | accepted code; timing is provisional |
| 2026-04-30 | Remove multiplication-output `optimize_size()` | 21.081848 s | -0.405688 s in repeat run | accepted code; timing is provisional |

The accepted, directly comparable part of the CUDA sequence reduced total wall time from 62.418158 s to 26.709146 s (57.2%). The lower 21-second results are retained as diagnostic evidence only because their measurements included an add/sub fast-path family that was later rejected and reverted.

## Accepted Optimization Ledger

| date | accepted change | measured evidence | result |
| --- | --- | --- | --- |
| 2026-04-30 | Sparse uvwXY generation | `init.build.witness.uvwXY`: 30.420833 s → 7.209468 s | Removed the dense-matrix initialization bottleneck. |
| 2026-04-30 | Binary sparse `.r1cs` preload | CUDA total: 39.731573 s → 32.728363 s; CPU total: 65.271813 s → 56.905538 s | Avoids JSON parsing, decimal-to-hex conversion, and dense reconstruction. |
| 2026-04-30 | `s0/s1` power-table cache | CUDA `s0_s1`: 1.206917 s → 0.057586 s | Eliminates repeated permutation-power construction. |
| 2026-04-30 | Coefficient-domain `div_by_vanishing_opt` | CUDA total: 31.712050 s → 28.910223 s | Replaces coset evaluation and interpolation with quotient-block recurrence. |
| 2026-04-30 | Algebraic polynomial-combination rewrites | CUDA `poly.combine`: 15.840093 s → 14.863306 s | Removes 12 generic polynomial multiplications through factorization and caching. |
| 2026-04-30 | Special-form polynomial products | Detail multiplication: 8.791025 s → 4.914589 s | Replaces applicable generic products with shifts, adds, and scaled copies. |
| 2026-04-30 | Column-batch biNTT | Historical stack `poly.combine`: 9.620149 s → 9.033003 s | Removes two transpose operations for real two-dimensional NTTs; current-code remeasurement remains required. |
| 2026-04-30 | Preserve multiplication output shape | Historical stack `mul_optimize_size`: 0.613358 s → 0 s | Removes post-multiplication output shrinking; current-code remeasurement remains required. |

## April 2026 CPU Detail

| metric | earlier CPU cache run | current CPU run | change |
| --- | ---: | ---: | ---: |
| total wall | 57.162002 s | 45.698497 s | -11.463505 s |
| init | 5.425999 s | 5.206907 s | -0.219092 s |
| prove0 | 12.109660 s | 10.091608 s | -2.018052 s |
| prove2 | 19.893836 s | 13.371695 s | -6.522141 s |
| prove4 | 15.942229 s | 13.330191 s | -2.612038 s |
| polynomial work | 20.606543 s | 13.548598 s | -7.058945 s |
| encode | 26.388774 s | 24.330398 s | -2.058376 s |

## Historical CPU Snapshots

These early measurements record the prior CPU optimization sequence. Their setup and timing semantics are not sufficiently documented to make a single end-to-end claim against the current reference, so they are preserved as dated snapshots rather than a comparable trend line.

| date | commit | total wall | recorded change |
| --- | --- | ---: | --- |
| 2026-01-29 | `d8c1c2b4` | 71.049089 s | Established the timing-report format and setup-parameter capture. |
| 2026-02-05 | `85d9149c` | 59.835278 s | Made the zero-copy sigma path the only sigma-loading path. |
| 2026-02-05 | `c1487461` | 66.383591 s | Refreshed preprocess inputs and denominator-inverse caching work. |
| 2026-02-06 | `127aa57b` | 52.947312 s | Added sparse R1CS evaluation for CPU and GPU paths. |
| 2026-02-06 | `ccc3d2d8` | 49.781555 s | Added fine-grained `prove4` timing instrumentation. |
| 2026-02-07 | `8839dbc5` | 46.743467 s | Improved `div_by_vanishing_opt` cache behavior. |
| 2026-02-08 | `7964656a` | 27.908515 s | Initialized the NTT domain once and refined timing coverage. |

## July 2026 Production Optimization Campaign

The July campaign used five retained first-proof samples for each isolated comparison. No post-hoc outliers were removed. The final current-code CPU reference, 37.077365 s, was recorded after the approved production sequence below. Fresh CUDA validation was deliberately not run after that final CPU-only sequence.

### Significant Accepted Changes

| date | change | CPU evidence | CUDA evidence | disposition |
| --- | --- | --- | --- | --- |
| 2026-07-27 | **Combined Pi opening (1A)** | 39.998 s → 38.332 s mean (-1.666 s) | 23.878 s → 23.683 s mean (-0.196 s) | accepted |
| 2026-07-27 | **Shared M/N X opening (1B)** | 38.465 s → 37.157 s mean (-1.308 s) | 24.760 s → 23.758 s mean (-1.002 s) | accepted |
| 2026-07-27 | Adjusted-point evaluation identity (2A) | 37.910 s → 37.805 s mean (-0.104 s) | 24.094 s → 23.944 s mean (-0.150 s) | accepted |
| 2026-07-27 | Shared three-point evaluation algorithm (2B) | 37.805 s → 37.123 s mean (-0.682 s) | 23.944 s → 23.778 s mean (-0.166 s) | accepted; ICICLE Batch selected |
| 2026-07-28 | Derived difference evaluations (2C) | 37.030 s → 36.788 s mean (-0.242 s) | inconclusive | accepted for its algebraic reduction |
| 2026-07-28 | Constant-free Ruffini correction (3A) | 37.089 s → 37.011 s mean (-0.079 s) | 23.583 s → 23.721 s mean (+0.138 s) | accepted for its algebraic reduction |
| 2026-07-28 | Decode the complete CRS grid once (5A) | 37.869 s → 37.147 s mean (-0.722 s) | 24.920 s → 23.914 s mean (-1.006 s) | accepted |

The project owner approved candidates 2C and 3A because they remove mathematical work independently of a specific backend, even though their end-to-end results did not establish the same cross-backend gain as 1A, 1B, and 2B.

### Rejected Or Retained Alternatives

| candidate | outcome | reason |
| --- | --- | --- |
| 2B custom Serial and Rayon implementations | rejected | ICICLE Batch preserves native backend dispatch; Serial regressed CUDA and Rayon was not selected for production. |
| 2D grouped same-point submission | rejected | Improved CPU but regressed CUDA; independent submissions were restored. |
| 3B/3C Ruffini kernels | rejected | No suitable ICICLE CUDA polynomial-division backend; no production integration. |
| 4 batched coefficient rescaling | rejected | The observed movement was smaller than control variation. |
| 5B/5C/5D CRS cache alternatives | rejected | None established a first-proof improvement over the selected full decoded-grid cache. |
| 6 zero-scalar MSM compaction | rejected | Results were inconclusive and affected by high-variance samples. |
| 7 and 8 device-data-flow candidates | rejected | Not benchmarked and not approved for implementation. |

### Completed Production Sequence

| step | production result | CPU smoke samples |
| --- | --- | --- |
| Restore independent same-point evaluations (2D removal) | Proof verification returned `true`. | 37.220667 s, 38.195563 s, 37.051648 s |
| Integrate derived difference evaluations (2C) | Proof verification returned `true`. | 37.579199 s, 37.192760 s, 37.113367 s |
| Integrate constant-free Ruffini correction (3A) | Proof verification returned `true`. | 37.659379 s, 37.071582 s, 37.077365 s |

These three-sample smoke blocks validate the completed production sequence; they do not replace the five-run isolated comparisons used for acceptance decisions.

## Timing Interpretation

The strict CUDA timing boundaries separate pure operations from preparation work:

| strict CUDA operation | time |
| --- | ---: |
| polynomial work | 20.568262 s |
| polynomial combination | 15.840093 s |
| pure encode/MSM | 1.262047 s |
| pure vanishing division | 1.310417 s |
| `prove0.q0q1` vanishing division | 0.461748 s |
| `prove2.qCXqCY` vanishing division | 0.848669 s |

This evidence moves the primary optimization focus from pure MSM and vanishing division to wrapper-level polynomial combination, intermediate-polynomial materialization, and monomial-shift paths.

## Rejected Experiments

The following results are intentionally excluded from the accepted trend. They remain documented to prevent their attractive measurements from being mistaken for current performance.

| experiment | observed result | rejection reason |
| --- | --- | --- |
| Row-wise no-resize add/sub | 26.709146 s → 24.682780 s | A direct follow-up did not provide a reliable end-to-end win. |
| Transpose/y-align add/sub | 24.682780 s → 22.142922 s | Mismatched-shape subtraction produced an incorrect result; the fast-path family was reverted. |
| Y-align add/sub follow-up | 22.142922 s → 22.598682 s | Regressed the end-to-end result and was reverted. |

## Update Procedure

For every material optimization or regression, append one row to the applicable history table and update **Current Reference** only when all of the following are recorded:

1. Date, commit, execution path, hardware, and benchmark setup.
2. The exact before and after `total wall` values from comparable runs.
3. Component timing only when it uses the same timing boundary as its comparison.
4. Whether the change is accepted, provisional, or reverted, with the reason.
5. A concise description of the bottleneck addressed and the next limiting cost.

Keep rejected experiments in the dedicated table; do not remove their status history or present their measurements as the current baseline.
