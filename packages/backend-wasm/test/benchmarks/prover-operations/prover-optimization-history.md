# Prover Optimization History

Audience: backend-wasm engineers measuring and optimizing prover performance.

This document records prover timing baselines and optimization decisions. `tmp/timing/prover-stage-timing.json` and `tmp/timing/prover-stage-timing.md` are overwritten on each run, so this file is the durable audit trail.

## Reporting Rules

The backend-wasm prover timing runner follows the native-style flat accumulated timing model:

- Raw events contain only `name`, `category`, `durationMs`, and `sizes`.
- Report rows are reconstructed bottom-up from accumulated events.
- No nested span tree, exclusive-self reconstruction, or overlapping child totals are used.
- Diagnostics remain outside the published package.

Published reports must use this fixed taxonomy:

Lowest operation layer:

| operation | definition |
| --- | --- |
| `polynomial.combination_without_multiplication` | Add, subtract, scale, fused scaled-add accumulation, coefficient rescale, and related shape/materialization work when the measured call site does not perform polynomial multiplication. |
| `polynomial.combination_with_multiplication` | Generic polynomial multiplication, special-form polynomial products, shared-right products, and protocol products that perform polynomial multiplication. |
| `polynomial.recursion` | Recursion polynomial calculation for the copy-constraint recursion path, including ROU-evaluation conversion, recursion evaluation buffer construction, and inverse conversion at the measured call-site boundary. |
| `polynomial.evaluation` | Polynomial evaluation at transcript challenge points. |
| `polynomial.div_ruffini` | Ruffini division. |
| `polynomial.div_vanishing` | Vanishing-polynomial division. |
| `polynomial.encode` | Polynomial commitment encoding, including MSM input preparation and the MSM call. |
| `binding.encode` | Binding commitment encoding, meaning `buildProverBinding(...)` and its four G1 binding commitments: `A_free`, `O_pub_free`, `O_mid`, and `O_prv`. |

Middle operation layer:

| operation | definition |
| --- | --- |
| `polynomial.combination` | `polynomial.combination_without_multiplication + polynomial.combination_with_multiplication` |
| `polynomial.recursion` | Lowest-layer `polynomial.recursion` |
| `polynomial.evaluation` | Lowest-layer `polynomial.evaluation` |
| `polynomial.division` | `polynomial.div_ruffini + polynomial.div_vanishing` |
| `encode` | `polynomial.encode + binding.encode` |

Top operation layer:

| operation | definition |
| --- | --- |
| `field.operations` | `polynomial.combination + polynomial.recursion + polynomial.evaluation + polynomial.division` |
| `encode` | `polynomial.encode + binding.encode` |

Execution boundary layer:

| row | definition |
| --- | --- |
| `init` | Witness polynomial construction and prover state construction. |
| `field.operations` | Top-layer field operation total. |
| `encode` | Top-layer encode total: `polynomial.encode + binding.encode`. |
| `stage.unclassified` | Prover stage wall time not assigned to `field.operations` or `polynomial.encode`. |
| `io` | Runtime bundle and generated artifact file loading. |
| `verify` | Generated proof verification check. |
| `output` | Verifier proof artifact creation. |
| `external.unclassified` | Root wall time not assigned to another execution-boundary row. |

The runner enforces:

- Every `prove*` diagnostic stage satisfies `poly + encode <= total`.
- Old lowest-layer categories such as `polynomial.add`, `polynomial.sub`, `polynomial.mul`, `polynomial.scale`, and `polynomial.combine` are absent.
- Middle and top rows are derived from lower-layer totals.
- Execution boundary rows sum to total wall time.
- `classified operation time <= total wall time + tolerance`.
- `unclassified prover time >= -tolerance`.

## Same-Code Post-Reboot Timing Refresh

The post-Priority-23 timing run was repeated after a system reboot without a
code change. This separates system-state variation from deterministic encoder
regression.

| row | before reboot | after reboot | delta |
| --- | ---: | ---: | ---: |
| `polynomial.encode` | 129.95 s | 115.70 s | -14.25 s |
| `binding.encode` | 2.19 s | 2.14 s | -0.05 s |
| encode | 132.14 s | 117.84 s | -14.29 s (-10.8%) |
| `field.operations` | 69.62 s | 61.96 s | -7.65 s (-11.0%) |
| total wall | 207.99 s | 186.31 s | -21.68 s (-10.4%) |

The after-reboot encode total differs by only `0.52%` from the valid earlier
current-taxonomy result of `117.23 s`. No encode implementation changed
between these two runs, so the elevated pre-reboot value is not treated as a
code regression.

## Timing Taxonomy Extension For Recursion And Evaluation

Related commit: `800516da Add recursion and evaluation timing rows`.

This is a diagnostics-only timing taxonomy change, not a prover performance optimization. The previous timing table left recursion polynomial construction and challenge-point polynomial evaluation inside `stage.unclassified`. The timing runner now reports them as first-class field-operation rows:

- `polynomial.recursion`: prove1 recursion polynomial calculation.
- `polynomial.evaluation`: prove3/prove4 polynomial evaluations at transcript challenge points.

Latest timing after the taxonomy change:

| row | total | count |
| --- | ---: | ---: |
| `polynomial.combination_without_multiplication` | 60.31 s | 61 |
| `polynomial.combination_with_multiplication` | 67.86 s | 23 |
| `polynomial.recursion` | 10.08 s | 1 |
| `polynomial.evaluation` | 8.40 s | 11 |
| `polynomial.div_ruffini` | 10.84 s | 5 |
| `polynomial.div_vanishing` | 5.83 s | 2 |
| `polynomial.encode` | 116.40 s | 18 |
| `binding.encode` | 2.02 s | 1 |
| `field.operations` | 163.31 s | 103 |
| `encode` | 118.42 s | 19 |
| `stage.unclassified` | 99 ms | 1 |
| prover stage total | 279.81 s | - |
| total wall | 288.45 s | - |

Classification effect:

- The immediately preceding timing taxonomy reported `stage.unclassified` around 18.13 s because recursion and evaluation work had no official rows.
- The new taxonomy reports `polynomial.recursion = 10.08 s` and `polynomial.evaluation = 8.40 s`, leaving only 99 ms of stage-level unclassified time.
- All timing invariant checks pass, including derived-layer equality and execution-boundary total-wall equality.

Verification:

```bash
npm run typecheck:scripts
npm run prover:stage-timing:check
```

## Adjusted-Point Evaluation Benchmark

Related commit: this commit.

This is benchmark evidence only. It does not change production prover code.

The benchmark tests the identity `scaleCoeffsX(a)(P)(x,y) = P(a*x,y)` and `scaleCoeffsY(b)(P)(x,y) = P(x,b*y)` for the current bivariate buffer representation. The goal is to determine whether evaluation-only scaled-polynomial paths should avoid materializing scaled coefficient buffers.

Command:

```bash
npm run bench:prover-ops -- --groups=evaluation --shapes=4096x256,8192x512 --iterations=1 --warmup=0 --json=tmp/timing/evaluation-adjusted-point-representative.json
```

Representative result:

| candidate | 4096x256 | 8192x512 |
| --- | ---: | ---: |
| `current-scale-x-then-eval` | 587.169 ms | 2328.985 ms |
| `adjusted-point-x-eval` | 336.211 ms | 1396.252 ms |
| `current-scale-y-then-eval` | 598.810 ms | 2315.450 ms |
| `adjusted-point-y-eval` | 342.664 ms | 1390.405 ms |
| `current-scale-xy-then-eval` | 837.558 ms | 3261.847 ms |
| `adjusted-point-xy-eval` | 349.626 ms | 1399.149 ms |
| `current-prove3-like-scaled-set` | 1524.671 ms | 6111.938 ms |
| `adjusted-point-prove3-like-set` | 1081.993 ms | 4220.614 ms |

Interpretation:

- Adjusted-point direct evaluation is consistently faster for the measured shapes.
- The prove3-like set improves by `1.41x` at `4096x256` and `1.45x` at `8192x512`.
- This candidate is applicable only where the scaled polynomial is needed solely for evaluation. It must not remove scaled-polynomial materialization from paths that later use the scaled polynomial in arithmetic.

Verification:

```bash
npm run typecheck:scripts
npm run bench:prover-ops -- --groups=evaluation --shapes=16x16 --iterations=1 --warmup=0 --json=tmp/timing/evaluation-adjusted-point-smoke.json
npm run bench:prover-ops -- --groups=evaluation --shapes=4096x256,8192x512 --iterations=1 --warmup=0 --json=tmp/timing/evaluation-adjusted-point-representative.json
```

## Accepted Production Adjusted-Point Challenge Evaluation

Related commit: `f9a3539c Apply adjusted-point challenge evaluations`.

Production `evaluateChallengePoints(...)` now computes `R_omegaX_eval` and `R_omegaX_omegaY_eval` by adjusting the evaluation point instead of materializing `RXY.scaleCoeffsX(...)` and `scaleCoeffsY(...)`.

Correctness boundary:

- `V_eval` and `R_eval` are unchanged.
- `R_omegaX_eval` now uses `RXY.eval(omega_m_i^-1 * chi, zeta)`.
- `R_omegaX_omegaY_eval` now uses `RXY.eval(omega_m_i^-1 * chi, omega_s_max^-1 * zeta)`.
- Opening-commitment scaled `rXY` polynomials are unchanged because those scaled polynomials are used later in polynomial arithmetic, not only for evaluation.
- The timing runner mirrors this production path so prove3-style diagnostics no longer include old scaled-polynomial materialization.

Stage timing comparison:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| challenge-evaluation diagnostic label | 8.44 s | 6.23 s | -2.21 s |
| `polynomial.combination_without_multiplication` | 60.31 s / 61 events | 58.53 s / 59 events | -1.78 s / -2 events |
| `polynomial.evaluation` | 8.40 s / 11 events | 8.42 s / 11 events | +0.02 s / 0 events |
| `field.operations` | 163.31 s | 163.36 s | +0.05 s |
| `stage.unclassified` | 99 ms | 113 ms | +14 ms |
| prover stage total | 279.81 s | 280.95 s | +1.14 s |
| total wall | 288.45 s | 288.91 s | +0.46 s |

Interpretation:

- The direct target improved: the prove3-style challenge-evaluation label no longer pays for two scaled-polynomial materializations.
- `polynomial.evaluation` stays effectively unchanged because the number of Horner evaluations is unchanged; the improvement is recorded in the removed non-multiplication combination work.
- Overall wall-time changes are within single-run noise for this small targeted rewrite, so future optimization selection should treat the operation-local reduction as the acceptance signal.

Verification:

```bash
npm run typecheck
npm run typecheck:scripts
npm run prover:ops:check
npm run prover:testing-mode:check
npm run prover:stage-timing:check
npm run build
npm run prover:browser:check
npm pack --dry-run --json
```

## Recursion And Evaluation Internal Breakdown

Related commit: this commit.

This is diagnostics-only evidence. It does not change production prover code.

The dedicated diagnostic command breaks down the two timing rows that were not intuitively explained by the official timing table:

```bash
npm run diagnose:prover:recursion-evaluation
```

The command writes structured output to `tmp/timing/prover-recursion-evaluation-breakdown.json`.

Measured recursion breakdown:

| substep | shape | time |
| --- | ---: | ---: |
| build `fXY` linear combination | 4096x256 | 1062.005 ms |
| build `gXY` linear combination | 4096x256 | 54.014 ms |
| resize `fXY` | 4096x256 | 3.317 ms |
| forward 2D NTT `fXY.toRouEvals` | 4096x256 | 426.056 ms |
| resize `gXY` | 4096x256 | 2.458 ms |
| forward 2D NTT `gXY.toRouEvals` | 4096x256 | 475.119 ms |
| recursion recurrence buffer | 4096x256 | 8731.575 ms |
| inverse 2D NTT `rXY.fromRouEvals` | 4096x256 | 550.855 ms |
| build `RXY` linear combination | 4096x256 | 72.817 ms |
| commit `RXY` encode | 8192x512 | 5691.022 ms |

Interpretation:

- The recursion-polynomial bottleneck is the recurrence buffer, not the 2D NTT implementation.
- The three 2D NTT operations together are about `1.45 s`; the recurrence buffer alone is about `8.73 s`.
- The recurrence performs about `m_i * s_max = 1,048,576` sequential field steps and currently uses one field division per step. Future recursion optimization should investigate eliminating repeated divisions or batching inversions before changing NTT scheduling again.
- `commit RXY encode` is listed for context, but it is a commitment/MSM cost, not part of the recursion-polynomial calculation row.

Measured challenge-evaluation breakdown:

| substep | shape | time |
| --- | ---: | ---: |
| build `VXY` linear combination | 4096x256 | 101.829 ms |
| build `RXY` linear combination | 4096x256 | 97.309 ms |
| compute scaled chi | - | 0.052 ms |
| compute scaled zeta | - | 0.008 ms |
| Horner eval `VXY(chi,zeta)` | 8192x512 | 1602.647 ms |
| Horner eval `RXY(chi,zeta)` | 8192x512 | 1582.092 ms |
| Horner eval `RXY(omega^-1 chi,zeta)` | 8192x512 | 1501.435 ms |
| Horner eval `RXY(omega^-1 chi,omega^-1 zeta)` | 8192x512 | 1482.823 ms |

Interpretation:

- The evaluation cost is almost entirely four full-size Horner passes over `8192x512` coefficient grids.
- Point adjustment is effectively free; the accepted adjusted-point rewrite removed scaled-polynomial materialization but did not reduce the number of full Horner passes.
- Future evaluation optimization must reduce repeated full-grid passes or reuse powers/intermediate row values across the three `RXY` evaluations. Another point-scaling rewrite will not materially improve this row by itself.

## Accepted Production Sparse Batch Scalar Conversion

Related commit: this commit.

Production `encodeSigma1Sparse(...)` now collects selected nonzero Montgomery scalars into one compact scalar buffer and converts that buffer with `Fr.batchFromMontgomeryBuffer(...)`. The previous production sparse path converted each selected scalar with `Fr.toRawLittleEndian(...)` while scanning coefficients.

Correctness boundary:

- sparse coefficient scan, zero skipping, CRS base selection, and row-major scalar/base ordering are unchanged;
- dense Sigma1 chunk encoding is unchanged;
- `G1.multiExpAffine(...)` still receives affine CRS bases and raw little-endian scalar bytes;
- the change affects only the sparse polynomial commitment path.

Benchmark evidence:

```bash
npm run bench:commitment-density -- --multi-thread --lengths=262144 --densities=0.1,0.25,0.5,0.75,1 --iterations=2 --warmup=0 --json=tmp/timing/commitment-density-sparse-batch-multi-thread-2pow18-iter2.json
```

At the current dense Sigma1 MSM chunk size, sparse-batch beat the previous sparse path end-to-end by `1.02x` to `1.06x` across the measured densities.

| density | previous sparse total ms | sparse-batch total ms | speedup |
| ---: | ---: | ---: | ---: |
| 0.10 | 163.191 | 154.173 | 1.06x |
| 0.25 | 363.380 | 355.334 | 1.02x |
| 0.50 | 667.983 | 652.061 | 1.02x |
| 0.75 | 962.074 | 937.015 | 1.03x |
| 1.00 | 1305.060 | 1262.759 | 1.03x |

Post-promotion timing:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.encode` | 117.48 s | 113.99 s | -3.49 s |
| `binding.encode` | 1.99 s | 2.01 s | +0.02 s |
| `encode` | 119.47 s | 116.01 s | -3.46 s |
| `field.operations` | 143.50 s | 141.39 s | -2.11 s |
| prover stage total | 279.63 s | 273.52 s | -6.11 s |
| total wall time | 287.48 s | 281.43 s | -6.05 s |

Verification commands:

```bash
npm run typecheck
npm run typecheck:scripts
npm run prover:ops:commitment
npm run prover:check
npm run prover:stage-timing:check
npm run build
npm pack --dry-run --json
```

Encode optimization closure:

- Project-owner conclusion: the encode area has no remaining optimization room under the current implementation plan and benchmark evidence.
- Encode optimization work is closed after the snarkjs-style large-MSM delivery, dense MSM chunk-size selection, primitive-parallelism confirmation, density benchmark review, and sparse batch scalar conversion.
- Closure scope: accepted encode work covers ffjavascript primitive-level MSM parallelism, bounded dense Sigma1 chunks at `262144` points, raw CRS section reuse for dense chunks, sparse/dense density routing, and sparse-path batch scalar conversion.
- Historical notes about compact rectangle extraction, CRS/base layout experiments, worker-wrapper commitment scheduling, encode input reporters, or additional commitment-input delivery work are audit records only. They are not active encode optimization backlog.
- Future prover optimization work should focus on non-encode bottlenecks shown by the current timing table.
- Do not add more encode optimization tasks unless new external evidence or a new project-owner decision explicitly reopens this area.

## Accepted Production Batched 2D NTT Segment Scheduler

Related commit: this commit.

Production `biNttBuffer()` now batches independent same-size row and column transforms at the ffjavascript worker-task boundary. The previous production path called ffjavascript's public `Fr.fft()` / `Fr.ifft()` once per row and once per column, which made prover-size grids submit thousands of small FFT calls.

Correctness boundary:

- independent rows or columns are not concatenated into one large 1D FFT;
- the row-major `(x, y)` layout is preserved by transposing before and after the column pass;
- inverse normalization and output rotation match ffjavascript's public `Fr.ifft()` behavior;
- segment sizes that exceed ffjavascript's direct mix path continue to use the public 1D FFT algorithm per segment.

Benchmark command:

```bash
npm run bench:2d-ntt -- --shapes=1024x256,4096x256 --modes=single,parallel --directions=forward,inverse --iterations=1 --warmup=0 --json=tmp/timing/2d-ntt-segment-scheduler.json
```

The benchmark parity-checks the batched candidate against production `biNttBuffer()` before timing.

Pre-promotion benchmark result:

| mode | direction | candidate | shape | ms/op |
| --- | --- | --- | ---: | ---: |
| single | forward | current-biNttBuffer | 1024x256 | 468.413 |
| single | forward | batched-segment-biNttBuffer | 1024x256 | 443.903 |
| single | inverse | current-biNttBuffer | 1024x256 | 505.052 |
| single | inverse | batched-segment-biNttBuffer | 1024x256 | 479.064 |
| single | forward | current-biNttBuffer | 4096x256 | 2081.253 |
| single | forward | batched-segment-biNttBuffer | 4096x256 | 1961.657 |
| single | inverse | current-biNttBuffer | 4096x256 | 2254.328 |
| single | inverse | batched-segment-biNttBuffer | 4096x256 | 2100.196 |
| parallel | forward | current-biNttBuffer | 1024x256 | 750.972 |
| parallel | forward | batched-segment-biNttBuffer | 1024x256 | 94.062 |
| parallel | inverse | current-biNttBuffer | 1024x256 | 753.399 |
| parallel | inverse | batched-segment-biNttBuffer | 1024x256 | 102.221 |
| parallel | forward | current-biNttBuffer | 4096x256 | 2415.140 |
| parallel | forward | batched-segment-biNttBuffer | 4096x256 | 362.200 |
| parallel | inverse | current-biNttBuffer | 4096x256 | 2835.549 |
| parallel | inverse | batched-segment-biNttBuffer | 4096x256 | 411.732 |

Post-promotion benchmark result:

| mode | direction | candidate | shape | ms/op |
| --- | --- | --- | ---: | ---: |
| single | forward | legacy-sequential-biNttBuffer | 1024x256 | 458.463 |
| single | forward | production-biNttBuffer | 1024x256 | 455.499 |
| single | inverse | legacy-sequential-biNttBuffer | 1024x256 | 525.494 |
| single | inverse | production-biNttBuffer | 1024x256 | 480.133 |
| single | forward | legacy-sequential-biNttBuffer | 4096x256 | 2066.471 |
| single | forward | production-biNttBuffer | 4096x256 | 1971.661 |
| single | inverse | legacy-sequential-biNttBuffer | 4096x256 | 2231.297 |
| single | inverse | production-biNttBuffer | 4096x256 | 2110.126 |
| parallel | forward | legacy-sequential-biNttBuffer | 1024x256 | 701.210 |
| parallel | forward | production-biNttBuffer | 1024x256 | 91.218 |
| parallel | inverse | legacy-sequential-biNttBuffer | 1024x256 | 711.655 |
| parallel | inverse | production-biNttBuffer | 1024x256 | 94.094 |
| parallel | forward | legacy-sequential-biNttBuffer | 4096x256 | 2433.564 |
| parallel | forward | production-biNttBuffer | 4096x256 | 378.400 |
| parallel | inverse | legacy-sequential-biNttBuffer | 4096x256 | 2457.709 |
| parallel | inverse | production-biNttBuffer | 4096x256 | 421.063 |

Full prover timing comparison:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 60.37 s | 59.16 s | -1.21 s |
| `polynomial.combination_with_multiplication` | 132.87 s | 68.26 s | -64.61 s |
| `polynomial.div_ruffini` | 11.19 s | 10.09 s | -1.10 s |
| `polynomial.div_vanishing` | 5.67 s | 6.00 s | +0.33 s |
| `polynomial.encode` | 117.67 s | 117.48 s | -0.19 s |
| `binding.encode` | 1.91 s | 1.99 s | +0.08 s |
| `field.operations` | 210.11 s | 143.50 s | -66.61 s |
| `encode` | 119.58 s | 119.47 s | -0.11 s |
| `init` | 15.80 s | 4.79 s | -11.01 s |
| `stage.unclassified` | 24.13 s | 18.65 s | -5.48 s |
| prover stage total | 351.91 s | 279.63 s | -72.28 s |
| total wall | 370.68 s | 287.48 s | -83.20 s |

Interpretation:

- The main confirmed improvement is in `polynomial.combination_with_multiplication`, down 64.61 s.
- The optimization targets bivariate NTT/ROU scheduling, so commitment encoding is effectively unchanged.
- `init` also drops because witness/state construction uses `fromRouEvals(...)` and therefore uses the production batched 2D NTT path.

Verification:

```bash
npm run typecheck
npm run typecheck:scripts
npm run polynomial:buffer:check
npm run prover:ops:polynomial
npm run prover:ops:check
npm run bench:2d-ntt -- --shapes=1024x256,4096x256 --modes=single,parallel --directions=forward,inverse --iterations=1 --warmup=0 --json=tmp/timing/2d-ntt-segment-scheduler-after-production.json
npm run prover:testing-mode:check
npm run prover:stage-timing:check
```

## Active Linear Accumulation Comparison

This is the active before/after comparison. Both runs use the same production-like timing taxonomy.

Commands:

```bash
# Before optimization: temporary worktree at 3c7da223 with the current timing runner copied in.
npm run prover:stage-timing:check

# After optimization: current package/backend-wasm branch.
npm run prover:stage-timing:check
```

Compared code points:

- Before: `3c7da223` (`Benchmark linear operation optimization candidates`), before the production linear accumulation rewrite.
- Optimization commit: `cddceefe` (`Optimize polynomial linear accumulation`).
- After: current branch with the production-like timing taxonomy.

Status:

- Before proof generation completed and generated proof verification completed.
- After proof generation completed and generated proof verification completed.
- Timing invariant failures: `0` in both runs.

Lowest operation layer:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 66.78 s | 60.37 s | -6.41 s |
| `polynomial.combination_with_multiplication` | 135.62 s | 132.87 s | -2.75 s |
| `polynomial.div_ruffini` | 10.51 s | 11.19 s | +0.69 s |
| `polynomial.div_vanishing` | 5.98 s | 5.67 s | -0.31 s |
| `polynomial.encode` | 118.02 s | 117.67 s | -0.35 s |
| `binding.encode` | 1.99 s | 1.91 s | -0.08 s |

Middle operation layer:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination` | 202.41 s | 193.24 s | -9.16 s |
| `polynomial.division` | 16.49 s | 16.87 s | +0.38 s |
| `encode` | 120.01 s | 119.58 s | -0.43 s |

Top operation layer:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `field.operations` | 218.89 s | 210.11 s | -8.78 s |
| `encode` | 120.01 s | 119.58 s | -0.43 s |

Execution boundary layer:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `init` | 16.43 s | 15.80 s | -0.63 s |
| `field.operations` | 218.89 s | 210.11 s | -8.78 s |
| `encode` | 120.01 s | 119.58 s | -0.43 s |
| `stage.unclassified` | 24.74 s | 24.13 s | -0.61 s |
| `io` | 0.98 s | 1.06 s | +0.08 s |
| `verify` | 0.02 s | 0.02 s | 0.00 s |
| `output` | 0.00 s | 0.00 s | 0.00 s |
| `external.unclassified` | 0.00 s | 0.00 s | 0.00 s |

Execution boundary:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| prover stage total | 361.65 s | 351.91 s | -9.74 s |
| classified operation time | 338.90 s | 329.69 s | -9.21 s |
| unclassified prover time | 42.17 s | 40.99 s | -1.18 s |
| total wall | 381.08 s | 370.68 s | -10.39 s |

Interpretation:

- The production linear accumulation rewrite reduced total wall time by 10.39 s under the active taxonomy in the latest run.
- The main measured improvement is in `polynomial.combination`, down 9.16 s.
- `polynomial.combination_with_multiplication` also decreased by 2.75 s, but that bucket still contains multiplication-heavy call sites and remains the largest active optimization target at 132.87 s.
- Upper-layer `encode` is now `polynomial.encode + binding.encode`, and it is the second largest active bucket at 119.58 s.
- `binding.encode` means `buildProverBinding(...)`; it is binding commitment work, not binary serialization.

## Recursion Recurrence Batch-Inverse Optimization

Related commit: `5ee48194` (`Optimize prover recursion recurrence`).

Change:

- Exposed ffjavascript `Fr.batchInverse(...)` as `FieldRuntime.batchInverseBuffer(...)`.
- Rewrote recursion recurrence construction to avoid per-element `field.div(...)`.
- The optimized path computes denominator inverses in one batch, multiplies each numerator by the corresponding inverse, and writes the suffix-product recurrence directly into final row-major output positions.
- The hot loop now avoids `readBufferElement(...)` and `writeBufferElement(...)` validation overhead after the input lengths have already been checked.
- No binary artifact validation, JSON/rkyv parsing, or fallback behavior was added to the prover runtime path.

Recursion/evaluation diagnostic comparison:

| metric | before | after | delta |
| --- | ---: | ---: | ---: |
| `recursion recurrence buffer` | 8731.575 ms | 710.206 ms | -8021.369 ms |

Standalone stage-timing comparison:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.recursion` | 10.08 s | 2.30 s | -7.78 s |
| prover stage total | 279.81 s | 269.37 s | -10.44 s |
| total wall | 288.45 s | 278.10 s | -10.35 s |

Verification:

- `npm run prover:ops:field` passed.
- `npm run prover:ops:polynomial` passed.
- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run diagnose:prover:recursion-evaluation` passed and wrote `tmp/timing/prover-recursion-evaluation-breakdown.json`.
- `npm run prover:check` passed and verified the generated proof through the prepared verifier runtime path.
- `npm run prover:stage-timing:check` passed in a standalone run and wrote `tmp/timing/prover-stage-timing.json`.

## Prover Evaluation Reuse Optimization

Related commit: `b5901e11` (`Optimize prover evaluation reuse`).

Change:

- Added the internal `evaluateAtScaledChallengeSet(...)` helper for the prover hot path. It evaluates one polynomial at `(x,y)`, `(scaledX,y)`, and `(scaledX,scaledY)` while sharing the row reductions for the first two values.
- Rewrote challenge evaluation for the three `RXY` values to use the shared-row helper.
- Rewrote the opening-commitment `rXY` evaluation values to use the shared-row helper while keeping the required `rOmegaX`, `rOmegaXOmegaY`, `rD1`, and `rD2` polynomial objects materialized for later polynomial arithmetic.
- Replaced `rD1.eval(chi,zeta)` and `rD2.eval(chi,zeta)` with derived scalar values: `rD1Eval = rXY(chi,zeta) - rXY(omegaMI^-1 * chi,zeta)` and `rD2Eval = rXY(chi,zeta) - rXY(omegaMI^-1 * chi,omegaSMax^-1 * zeta)`.
- Replaced the scalar `lagrangeK0Eval` calculation with the direct `L_0(chi)` formula while keeping the materialized `lagrangeK0XY` polynomial for `lagrangeK0XY.mul(...)`.
- Updated the stage-timing mirror and prover polynomial-operation parity checks for the new helpers.

Standalone stage-timing comparison:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.evaluation` | 8.42 s | 5.31 s | -3.11 s |
| `field.operations` | 151.31 s | 144.26 s | -7.05 s |
| prover stage total | 269.37 s | 258.49 s | -10.88 s |
| total wall | 278.10 s | 266.36 s | -11.74 s |

The before values are the latest recorded standalone stage-timing result after the recursion recurrence batch-inverse optimization. The after values are from the standalone `npm run prover:stage-timing:check` run for this change.

Verification:

- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run prover:ops:polynomial` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:check` passed and verified the generated proof through the prepared verifier runtime path.
- `npm run prover:stage-timing:check` passed and wrote `tmp/timing/prover-stage-timing.json`.
- `npm run build` passed.
- `npm run prover:browser:check` passed and verified the generated proof in Chromium.
- `npm pack --dry-run --json` passed.

## Ruffini Opening Division Optimization

Related commit: `1d18b1c5` (`Optimize Ruffini opening division`).

Candidate selection:

- Candidate A changed the X recurrence from fixed-Y strided traversal to reverse-X steps over contiguous Y rows. Its independent five-call estimate improved from `9387.557 ms` to `7937.845 ms` (`15.4%`).
- Candidate B retained the old traversal and replaced repeated coefficient accessors with one-time validation and direct raw-buffer offsets. Its independent five-call estimate improved from `9533.085 ms` to `8778.695 ms` (`7.9%`).
- Candidate C removed full `P-c` materialization by dividing `P` and subtracting `c` only from the scalar remainder. Its independent generic five-call estimate improved from `12481.953 ms` to `8980.260 ms` (`28.1%`).
- After all candidates were measured independently, A+B improved the division-kernel five-call estimate from `8936.214 ms` to `7204.623 ms` (`19.4%`).
- The generic A+B+C benchmark improved from `12624.563 ms` to `7339.050 ms` (`41.9%`). This was a candidate-selection result, not an integrated prover prediction.

Production change:

- `BivariatePolynomialBuffer.divByRuffini(...)` now validates input points once, processes each reverse X recurrence step across a contiguous Y row, and reads and writes field elements through direct byte views.
- Opening commitments no longer allocate complete constant-corrected numerator polynomials for `Pi_A`, `M`, `N`, `Pi_B`, or `Pi_C`.
- Constant corrections are applied only to the returned scalar remainder. Quotient polynomials are unchanged because subtracting a scalar constant does not change either synthetic-division quotient.
- The stage-timing mirror uses the same production expressions and retains the fixed timing taxonomy.

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 55.43 s | 52.78 s | -2.65 s |
| `polynomial.combination_with_multiplication` | 65.92 s | 66.51 s | +0.59 s |
| `polynomial.recursion` | 2.09 s | 1.91 s | -0.18 s |
| `polynomial.evaluation` | 5.31 s | 5.28 s | -0.03 s |
| `polynomial.div_ruffini` | 9.97 s | 8.79 s | -1.18 s |
| `polynomial.div_vanishing` | 5.54 s | 5.64 s | +0.10 s |
| `polynomial.encode` | 114.21 s | 114.51 s | +0.30 s |
| `binding.encode` | 1.98 s | 1.95 s | -0.03 s |
| `field.operations` | 144.26 s | 140.92 s | -3.34 s |
| prover stage total | 258.49 s | 255.44 s | -3.05 s |
| total wall | 266.36 s | 263.51 s | -2.85 s |

Interpretation:

- The intended rows improved: Ruffini division decreased by `1.18 s`, and removing constant-polynomial construction reduced combination-without-multiplication by `2.65 s`.
- Small increases in unchanged multiplication, vanishing division, and encode categories are run-to-run variance; they are not part of the promoted rewrite.
- The integrated total-wall reduction is `2.85 s` (`1.1%`). It is smaller than the generic candidate estimate because only a portion of the five real opening numerators is removable constant materialization and the rest of the prover is unchanged.

Verification:

- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run prover:ops:check` passed.
- `npm run prover:testing-mode:check` passed, including native testing-mode-style witness, quotient, recursion, and opening invariants.
- `npm run prover:check` passed and verified the generated proof through the prepared verifier runtime path.
- `npm run prover:stage-timing:check` passed and wrote the latest report to `tmp/timing/prover-stage-timing.json`.
- `npm run build` passed.
- `npm run prover:browser:check` passed; Chromium generated a 2408-byte proof in `257.57 s` and verified it in `20 ms`.
- `npm pack --dry-run --json` passed, and diagnostics and benchmark sources were absent from the package file list.

## Lagrange K0 Multiplication Optimization

Benchmark commits:

- `38a3a054` (`Benchmark K0 multiplication data path`)
- `eb52001b` (`Benchmark batched K0 multiplication`)
- `5ba49b2f` (`Benchmark K0 sliding convolution`)
- `fe77809b` (`Benchmark optimized K0 sliding data path`)
- `b623816f` (`Select optimized K0 multiplication candidate`)

Production commit: `c02865f9` (`Optimize Lagrange K0 multiplication`).

Candidate selection:

- Candidate A retained the sequential per-column FFT/IFFT algorithm and changed only direct buffer access and output ownership. Its weighted four-call estimate improved by `2.0%`, which was insufficient for standalone promotion.
- Candidate B batched the independent X transforms. It improved the weighted estimate by `29.4%`, but its largest explicit temporary footprint was approximately `768.5 MiB`, excluding internal worker-task allocations.
- Candidate C used the exact K0 sliding-window recurrence and improved the weighted estimate by `56.0%`.
- C+A added direct coefficient-buffer views and owned output construction, improving the weighted estimate by `57.0%` relative to current production.
- The selected C+A+batch-scale combination moved the final scalar multiplication into one `batchApplyKeyBuffer(...)` call. It improved the weighted estimate from `22442.132 ms` to `5353.075 ms` (`76.1%`) with one output-sized unscaled buffer plus a small Y-row window.

Production change:

- Added the dedicated `multiplyByLagrangeK0(polynomial, mI)` helper. It requires the known K0 domain size and does not inspect arbitrary coefficients to infer polynomial identity.
- Replaced exactly four K0 products in copy-quotient and opening-commitment construction.
- Kept generic X-univariate multiplication unchanged.
- Updated the timing mirror without changing the fixed timing taxonomy.

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| four K0 multiplication events | 18.584 s | 5.491 s | -13.093 s |
| `polynomial.combination_without_multiplication` | 52.78 s | 52.46 s | -0.32 s |
| `polynomial.combination_with_multiplication` | 66.51 s | 53.64 s | -12.87 s |
| `polynomial.recursion` | 1.91 s | 1.98 s | +0.07 s |
| `polynomial.evaluation` | 5.28 s | 5.32 s | +0.04 s |
| `polynomial.div_ruffini` | 8.79 s | 8.59 s | -0.20 s |
| `polynomial.div_vanishing` | 5.64 s | 5.60 s | -0.04 s |
| `polynomial.encode` | 114.51 s | 114.48 s | -0.03 s |
| `binding.encode` | 1.95 s | 1.95 s | 0.00 s |
| `field.operations` | 140.92 s | 127.59 s | -13.33 s |
| prover stage total | 255.44 s | 242.08 s | -13.36 s |
| total wall | 263.51 s | 250.15 s | -13.36 s |

Interpretation:

- The four production K0 calls improved by `70.5%`, close to the selected isolated candidate's `76.1%` estimate.
- The intended multiplication category decreased by `12.87 s`, while unrelated categories stayed within small run-to-run variation.
- Total wall time decreased by `13.36 s` (`5.1%`). This integrated result, not the isolated benchmark percentage, is the prover-level improvement.

Verification:

- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run prover:ops:polynomial` passed.
- `npm run prover:ops:check` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:check` passed and verified the generated proof.
- `npm run prover:stage-timing:check` passed and produced the timing table above.
- `npm run build` passed.
- `npm run prover:browser:check` passed; Chromium generated a 2408-byte proof in `243.08 s` and verified it in `19 ms`.
- `npm pack --dry-run --json` passed with 249 files and no test, script, temporary, benchmark, or diagnostics paths.

## Special-Form Polynomial Multiplication Optimization

Related commit: `06ea4a26` (`Fuse special-form polynomial products`).

Independent candidate results at input shape `4096x256`:

| operation | legacy median | fused median | reduction |
| --- | ---: | ---: | ---: |
| `(X-1)P` | 610.016 ms | 168.640 ms | 72.4% |
| `(1-X)P` | 607.958 ms | 169.154 ms | 72.2% |
| X-linear | 1264.852 ms | 538.572 ms | 57.4% |
| Y-linear | 1264.385 ms | 540.269 ms | 57.3% |
| term9 | 2495.228 ms | 869.045 ms | 65.2% |

Candidate selection:

- Each candidate was measured independently before production code changed.
- Every candidate passed exact byte parity on deterministic full, sparse, zero, and boundary inputs.
- The combined pre-promotion run totaled `6269.880 ms` legacy versus `2323.621 ms` fused (`62.9%`).
- All five candidates are compatible because each replaces one operation-local materialization chain with a direct owned-output kernel without sharing mutable state or changing formulas.

Production change:

- `(X-1)P` and `(1-X)P` now perform one direct subtraction traversal.
- X-linear and Y-linear products now write the two scaled source terms directly into one output.
- term9 now writes `c*P[x,y] + a*P[x-1,y] + b*P[x,y-1]` directly into one output.
- Existing helper names, call sites, allocated-shape semantics, transcript behavior, and timing taxonomy are unchanged.
- The executable benchmark retains both the old formulas and an independent benchmark-local fused oracle. Post-promotion timing measured `6271.535 ms` legacy versus `2320.722 ms` production (`63.0%`).

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| ten promoted special-form events | 17.67 s | 6.56 s | -11.11 s |
| `polynomial.combination_without_multiplication` | 52.46 s | 53.64 s | +1.18 s |
| `polynomial.combination_with_multiplication` | 53.64 s | 42.79 s | -10.85 s |
| `polynomial.recursion` | 1.98 s | 2.29 s | +0.31 s |
| `polynomial.evaluation` | 5.32 s | 5.33 s | +0.01 s |
| `polynomial.div_ruffini` | 8.59 s | 8.83 s | +0.24 s |
| `polynomial.div_vanishing` | 5.60 s | 5.72 s | +0.12 s |
| `polynomial.encode` | 114.48 s | 115.37 s | +0.89 s |
| `binding.encode` | 1.95 s | 2.03 s | +0.08 s |
| `field.operations` | 127.59 s | 118.62 s | -8.97 s |
| encode | 116.43 s | 117.40 s | +0.97 s |
| prover stage total | 242.08 s | 234.00 s | -8.08 s |
| total wall | 250.15 s | 241.90 s | -8.25 s |

Interpretation:

- The intended ten events decreased by `11.11 s` (`62.9%`), matching the independent combined benchmark.
- The complete multiplication category decreased by `10.85 s`; unchanged categories varied upward by smaller amounts in this run.
- Total wall time decreased by `8.25 s` (`3.3%`).
- The non-instrumented Node run measured the copy-quotient span at `87.84 s` and the opening span at `81.67 s`, and the generated proof verified successfully.
- Chromium proof generation decreased from the previous `243.08 s` to `233.30 s` and verification completed in `24 ms`.

Verification:

- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run prover:ops:polynomial` passed.
- `npm run prover:ops:check` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:check` passed and verified the generated proof.
- `npm run prover:stage-timing:check` passed and produced the timing table above.
- `npm run build` passed.
- `npm run prover:browser:check` passed.
- `npm pack --dry-run --json` passed with 249 files and no test, script, temporary, benchmark, or diagnostics paths.

## Lagrange KL Multiplication Optimization

Production commit: `5f8723bd` (`Optimize Lagrange KL multiplication`).

Candidate selection:

- Direct KL construction uses the exact separable geometric coefficient
  formula instead of two inverse transforms.
- KL multiplication uses weighted X/Y sliding recurrences instead of generic
  2D polynomial multiplication.
- Construction and multiplication were benchmarked independently before
  promotion. Both pass exact byte parity and an independent small-shape dense
  convolution oracle.
- At `mI=4096`, `sMax=256`, and polynomial shape `4096x256`, construction
  decreased from `940.573 ms` to `195.987 ms` (`79.2%`), multiplication
  decreased from `5454.478 ms` to `2368.567 ms` (`56.6%`), and the independent
  combined path decreased from `6409.385 ms` to `2564.554 ms` (`60.0%`).
- The selected multiplication path reduces explicit temporary storage from
  approximately `384 MiB` to approximately `192 MiB` at the representative
  shape.

Production change:

- `buildLagrangeKl(...)` now writes the separable geometric coefficients
  directly.
- Added `multiplyByLagrangeKl(...)`, whose API requires the known `mI` and
  `sMax` semantics.
- Replaced only the measured `p1` generic product in copy-quotient
  construction.
- Retained generic polynomial multiplication unchanged.
- The post-promotion benchmark measured `6376.665 ms` for the legacy combined
  path and `2578.966 ms` for current production (`59.6%`).

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| KL construction plus `p1` multiplication | 7.304 s | 2.820 s | -4.484 s |
| `polynomial.combination_without_multiplication` | 53.64 s | 53.39 s | -0.25 s |
| `polynomial.combination_with_multiplication` | 42.79 s | 37.96 s | -4.83 s |
| `polynomial.recursion` | 2.29 s | 1.92 s | -0.37 s |
| `polynomial.evaluation` | 5.33 s | 5.41 s | +0.08 s |
| `polynomial.div_ruffini` | 8.83 s | 8.81 s | -0.02 s |
| `polynomial.div_vanishing` | 5.72 s | 5.66 s | -0.06 s |
| `polynomial.encode` | 115.37 s | 115.11 s | -0.26 s |
| `binding.encode` | 2.03 s | 1.96 s | -0.07 s |
| `field.operations` | 118.62 s | 113.15 s | -5.47 s |
| encode | 117.40 s | 117.07 s | -0.33 s |
| prover stage total | 234.00 s | 228.26 s | -5.74 s |
| total wall | 241.90 s | 236.86 s | -5.04 s |

Interpretation:

- The two targeted events decreased by `4.484 s` (`61.4%`), consistent with
  the independent and post-promotion benchmarks.
- The complete multiplication category decreased by `4.83 s`.
- Total wall time decreased by `5.04 s` (`2.1%`).
- Chromium proof generation completed in `229.72 s`, and verification
  completed in `20 ms`.

Verification:

- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run prover:ops:check` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:check` passed and verified the generated proof.
- `npm run prover:stage-timing:check` passed and produced the timing table above.
- `npm run build` passed.
- `npm run prover:browser:check` passed.
- `npm pack --dry-run --json` passed with 249 files and no test, script,
  temporary, benchmark, or diagnostics paths.

## Shifted ROU Product Reuse

Production commit: `13cf6744` (`Reuse shifted ROU evaluations in copy
quotient`).

Candidate selection:

- The three copy-quotient products share the same base polynomial `r`, while
  two left operands are coefficient-scaled versions of `r` and two right
  operands share `f`.
- On the enlarged multiplication domain, scaling by `omega_mI^-1` and
  `omega_sMax^-1` is exactly a cyclic evaluation-index shift. Small-domain
  tests verify the relation against independent forward transforms byte for
  byte.
- The candidate transforms `r`, `g`, and `f` once each, applies the two
  required shifts while reading the `r` evaluation buffer, and runs the same
  three inverse transforms as before. It removes two forward transforms
  without materializing shifted evaluation buffers.
- At input shape `4096x256`, the independent benchmark decreased from
  `14703.416 ms` to `11505.709 ms` (`21.7%`) with unchanged reported explicit
  temporary storage of `384 MiB`, excluding the three required result buffers.

Production change:

- Added `multiplyOmegaShiftedProducts(...)` with explicit source-domain
  dimensions.
- Replaced the separate `rG` product and shared-right pair only in
  copy-quotient construction.
- Removed the superseded shared-right-only production helper.
- Preserved coefficient-domain `rOmegaX` and `rOmegaXOmegaY` construction
  because later copy-quotient subtraction formulas still require them.
- The post-promotion benchmark measured `14456.432 ms` for the retained legacy
  path and `11483.241 ms` for current production (`20.6%`).

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 53.39 s | 53.82 s | +0.43 s |
| `polynomial.combination_with_multiplication` | 37.96 s | 34.73 s | -3.23 s |
| `polynomial.recursion` | 1.92 s | 2.17 s | +0.25 s |
| `polynomial.evaluation` | 5.41 s | 5.36 s | -0.05 s |
| `polynomial.div_ruffini` | 8.81 s | 8.81 s | 0.00 s |
| `polynomial.div_vanishing` | 5.66 s | 5.69 s | +0.03 s |
| `polynomial.encode` | 115.11 s | 115.12 s | +0.01 s |
| `binding.encode` | 1.96 s | 2.04 s | +0.08 s |
| `field.operations` | 113.15 s | 110.58 s | -2.57 s |
| encode | 117.07 s | 117.16 s | +0.09 s |
| prover stage total | 228.26 s | 225.71 s | -2.55 s |
| total wall | 236.86 s | 234.06 s | -2.80 s |

Interpretation:

- The multiplication category decreased by `3.23 s`, consistent with the
  isolated three-product benchmark.
- Total wall time decreased by `2.80 s` (`1.2%`).
- Chromium proof generation completed in `226.78 s`, and verification
  completed in `21 ms`.

Verification:

- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run prover:ops:check` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:check` passed and verified the generated proof.
- `npm run prover:stage-timing:check` passed and produced the timing table above.
- `npm run build` passed.
- `npm run prover:browser:check` passed.
- `npm pack --dry-run --json` passed with 249 files and no test, script,
  temporary, benchmark, or diagnostics paths.

## Generic Multiplication Buffer Optimization

Benchmark commit: `99947f12` (`Benchmark generic multiplication buffers`).

Production commit: `348db687` (`Optimize generic polynomial multiplication
buffers`).

Candidate selection:

- The remaining standalone generic multiplication is `prove0.p0XY.mul` with
  two `4096x256` inputs and an `8192x512` output.
- D1 replaces nested per-element resize access with zero allocation and
  contiguous source-row copies. It decreased the complete product from
  `5363.381 ms` to `5202.393 ms` (`3.0%`).
- D2 keeps current padding and changes only the pointwise loop. It measured
  `5348.244 ms` current versus `5330.142 ms` candidate (`0.34%`) with
  overlapping ranges and was rejected as a standalone promotion.
- The compatibility run measured `5337.722 ms` current, `5246.047 ms` D1,
  `5270.137 ms` D2, and `5175.420 ms` D1+D2. The selected combination's
  maximum `5180.980 ms` was below the current minimum `5322.863 ms`.

Production change:

- Generic `BivariatePolynomialBuffer.mul(...)` uses operation-local row-copy
  padding and validated raw pointwise writes.
- Public `resize(...)`, forward/inverse NTT scheduling, univariate
  multiplication, and protocol-specific multiplication helpers are unchanged.
- The executable benchmark retains the previous generic implementation.
- The post-promotion comparison measured `5374.002 ms` legacy versus
  `5138.923 ms` current production (`4.4%`).

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `prove0.p0XY.mul` | 6.336 s | 6.055 s | -0.281 s |
| `polynomial.combination_without_multiplication` | 53.82 s | 53.97 s | +0.15 s |
| `polynomial.combination_with_multiplication` | 34.73 s | 34.17 s | -0.56 s |
| `polynomial.recursion` | 2.17 s | 2.00 s | -0.17 s |
| `polynomial.evaluation` | 5.36 s | 5.33 s | -0.03 s |
| `polynomial.div_ruffini` | 8.81 s | 8.85 s | +0.04 s |
| `polynomial.div_vanishing` | 5.69 s | 5.75 s | +0.06 s |
| `polynomial.encode` | 115.12 s | 115.20 s | +0.08 s |
| `binding.encode` | 2.04 s | 2.03 s | -0.01 s |
| `field.operations` | 110.58 s | 110.07 s | -0.51 s |
| encode | 117.16 s | 117.23 s | +0.07 s |
| prover stage total | 225.71 s | 225.27 s | -0.44 s |
| total wall | 234.06 s | 233.71 s | -0.35 s |

Interpretation:

- The direct target decreased by `0.281 s` (`4.4%`), matching the
  post-promotion benchmark percentage.
- The full multiplication category changed by `0.56 s`; only the target row
  is attributed to this rewrite, while other event changes are timing
  variation.
- Chromium proof generation completed in `226.13 s`, and verification
  completed in `24 ms`.

Verification:

- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run prover:ops:check` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:check` passed and verified the generated proof.
- `npm run prover:stage-timing:check` passed and produced the timing table above.
- `npm run build` passed.
- `npm run prover:browser:check` passed.
- `npm pack --dry-run --json` passed with 249 files and no test, script,
  temporary, benchmark, or diagnostics paths.

## Same-Shape Add/Sub Single-Pass Construction

Production commit: `9edb6876` (`Optimize same-shape polynomial addition`).

Production change:

- `BivariatePolynomialBuffer.add(...)` and `sub(...)` now construct a
  same-shape output in one coefficient traversal.
- Mixed-shape operations retain the previous zero-accumulator and prefix
  accumulation path.
- The change removes the previous same-shape sequence of zero allocation,
  complete left-input accumulation, and complete right-input accumulation.

Representative post-promotion benchmark:

| operation | shape | promoted production | retained direct candidate |
| --- | ---: | ---: | ---: |
| add | `4096x256` | 190.550 ms | 190.496 ms |
| sub | `4096x256` | 190.058 ms | 200.176 ms |
| add | `8192x512` | 876.130 ms | 765.305 ms |
| sub | `8192x512` | 872.330 ms | 906.986 ms |

The promoted production path is the current result in this table. The
retained candidates are independent benchmark implementations and do not
replace production.

Integrated target-event comparison:

| target event set | before | after | delta |
| --- | ---: | ---: | ---: |
| same-shape and mixed add/sub call-site events | 10.790 s | 8.917 s | -1.873 s (-17.4%) |

The mixed-shape events are included to keep the call-site set stable even
though their implementation was intentionally unchanged. The largest direct
same-shape reductions were `prove2.p2_input` (`1.517 s` to `0.904 s`) and
`prove2.p3.sub` (`1.616 s` to `0.884 s`).

Standalone stage-timing context:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 53.97 s | 56.11 s | +2.14 s |
| `polynomial.combination_with_multiplication` | 34.17 s | 37.49 s | +3.32 s |
| `field.operations` | 110.07 s | 117.84 s | +7.77 s |
| encode | 117.23 s | 134.03 s | +16.80 s |
| prover stage total | 225.27 s | 249.75 s | +24.48 s |
| total wall | 233.71 s | 258.28 s | +24.57 s |

Interpretation:

- The stable target call-site set decreased by `1.873 s`; this is the
  attributable integrated result for the rewrite.
- The standalone full-run totals regressed while unrelated multiplication and
  encode rows also increased. Those changes are recorded as run variation and
  are not attributed to the add/sub rewrite.
- Chromium proof generation completed in `242.56 s`, and verification
  completed in `22 ms`.

Verification:

- `npm run typecheck` passed.
- `npm run polynomial:buffer:check` passed.
- `npm run prover:ops:polynomial` passed.
- `npm run prover:ops:check` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:stage-timing:check` passed and verified the generated proof.
- `npm run build` passed.
- `npm run prover:browser:check` passed.
- `npm pack --dry-run --json` passed with 249 files and no test, script,
  temporary, benchmark, or diagnostics paths.

## Zero-Buffer Initialization Removal

Production commit: `217becb8` (`Remove redundant field zero initialization`).

Production change:

- `createFieldRuntime(...)` now rejects a field whose additive identity is not
  represented by all-zero bytes.
- `FieldRuntime.createZeroBuffer(...)` returns the already zero-initialized
  `Uint8Array` directly instead of rewriting every field-element slot.
- The field-buffer parity check covers both the field-zero representation and
  the complete raw zero-buffer bytes.

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 56.11 s | 55.63 s | -0.48 s |
| `polynomial.combination_with_multiplication` | 37.49 s | 37.84 s | +0.35 s |
| `field.operations` | 117.84 s | 117.65 s | -0.19 s |
| encode | 134.03 s | 134.47 s | +0.44 s |
| prover stage total | 249.75 s | 249.98 s | +0.23 s |
| total wall | 258.28 s | 258.94 s | +0.66 s |

Interpretation:

- The full-run changes are within the observed run-to-run range. This rewrite
  is retained because it removes semantically redundant writes and adds an
  explicit representation invariant, not because a standalone full-prover
  speedup was measurable.
- Chromium proof generation completed in `242.81 s`, and verification
  completed in `52 ms`.

Verification:

- `npm run prover:ops:field` passed.
- `npm run typecheck` passed.
- `npm run prover:ops:check` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:stage-timing:check` passed and verified the generated proof.
- `npm run build` passed.
- `npm run prover:browser:check` passed.
- `npm pack --dry-run --json` passed with 249 files and no test, script,
  temporary, benchmark, or diagnostics paths.

## Opening pC Term Fusion

Benchmark commit: `55bfacae` (`Benchmark opening polynomial term fusion`).

Production commit: `3930b3f0` (`Fuse opening polynomial terms`).

Candidate result:

- The complete current path materialized
  `term5 = rEval*g - rOmegaXEval*f` and
  `term6 = rEval*g - rOmegaXYEval*f` before constructing `pC`.
- The fused candidate applies
  `a*term5 + b*term6 = rEval*(a+b)*g -
  (a*rOmegaXEval + b*rOmegaXYEval)*f`.
- Exact output-buffer parity passed at smoke and representative shapes.
- At base shape `4096x256` and output shape `8192x512`, the complete current
  path measured `5477.132 ms` and the fused path measured `4156.551 ms`, a
  `1320.581 ms` (`24.1%`) reduction.

Production change:

- Opening `pC` now computes the final `gXY` and `fXY` scalars directly.
- The two temporary polynomial objects are removed.
- The timing mirror uses the same fused equation and no longer reports
  separate `prove4.term5` and `prove4.term6` events.

Integrated target comparison:

| target event set | before | after | delta |
| --- | ---: | ---: | ---: |
| `term5 + term6 + pC` / fused `pC` | 7.043 s | 5.510 s | -1.533 s (-21.8%) |

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 55.63 s | 53.78 s | -1.85 s |
| `polynomial.combination_with_multiplication` | 37.84 s | 37.68 s | -0.16 s |
| `field.operations` | 117.65 s | 115.56 s | -2.09 s |
| encode | 134.47 s | 135.08 s | +0.61 s |
| prover stage total | 249.98 s | 248.38 s | -1.60 s |
| total wall | 258.94 s | 256.76 s | -2.18 s |

Chromium proof generation completed in `242.78 s`, and verification completed
in `22 ms`.

Verification:

- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:stage-timing:check` passed and verified the generated proof.
- `npm run build` passed.
- `npm run prover:browser:check` passed.
- `npm pack --dry-run --json` passed with 249 files and no test, script,
  temporary, benchmark, or diagnostics paths.

## Copy Quotient Linear-Term Fusion

Benchmark commit: `6e50df0b` (`Benchmark copy polynomial term fusion`).

Production commit: `ec31e7dd` (`Fuse copy quotient linear terms`).

The independent benchmark covered X/Y linear factors, zero/unit/non-unit
addend scales, and complete term2 and Lagrange-K0 term3 paths. At the real
`4096x256` input shape, the four complete paths decreased from `8773.274 ms`
to `7190.939 ms`, a `1582.335 ms` (`18.0%`) reduction with exact output parity.

Production adds dedicated X/Y helpers that construct
`linearFactor(rD) + rR*gD` in one output buffer. Only the four copy-quotient
call sites use them.

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 53.78 s | 54.09 s | +0.31 s |
| `polynomial.combination_with_multiplication` | 37.68 s | 35.79 s | -1.89 s |
| `field.operations` | 115.56 s | 113.67 s | -1.89 s |
| encode | 135.08 s | 135.71 s | +0.63 s |
| prover stage total | 248.38 s | 247.26 s | -1.12 s |
| total wall | 256.76 s | 255.25 s | -1.51 s |

Chromium proof generation completed in `241.44 s`, and verification completed
in `22 ms`. Type checks, testing-mode invariants, stage timing and generated
proof verification, build, Chromium verification, and package inspection
passed.

## Coefficient Rescale and Batch-Key Scaling

Benchmark commit: `1f789b58` (`Benchmark coefficient rescale paths`).

Production commit: `9f35558c` (`Optimize polynomial coefficient scaling`).

Candidate result:

- Validated-once direct subarray loops improved the complete uniform/X/Y
  scaling paths at both `4096x256` and `8192x512`.
- Public ffjavascript batch-key scaling reduced representative uniform and Y
  root-cycle scaling by about one order of magnitude.
- Exact byte parity passed for all candidates.
- Y batch scaling is restricted to factors whose order divides `ySize`; the
  production `omegaSMax^-1` factors satisfy this requirement.

Production change:

- `scaleAssign`, `scaleCoeffsXAssign`, and `scaleCoeffsYAssign` now validate
  their owned coefficient buffer once and use direct element subarrays.
- Copy and opening use `batchApplyKeyBuffer(...)` for the
  `omegaSMax^-1` Y rescale.
- Opening uses `batchApplyKeyBuffer(...)` for the uniform `term10` scale.
- Generic Y factors and all X rescaling remain on explicit loops.

Integrated target comparison:

| target event set | before | after | delta |
| --- | ---: | ---: | ---: |
| two Y root-cycle rescale events | 0.598 s | 0.247 s | -0.351 s |
| opening `term10` scale | 0.269 s | 0.028 s | -0.241 s |

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 54.09 s | 53.42 s | -0.67 s |
| `polynomial.combination_with_multiplication` | 35.79 s | 34.82 s | -0.97 s |
| `field.operations` | 113.67 s | 111.49 s | -2.19 s |
| encode | 135.71 s | 135.98 s | +0.27 s |
| prover stage total | 247.26 s | 245.21 s | -2.06 s |
| total wall | 255.25 s | 253.74 s | -1.51 s |

Chromium proof generation completed in `236.67 s`, and verification completed
in `19 ms`.

Verification:

- `npm run typecheck` passed.
- `npm run typecheck:scripts` passed.
- `npm run polynomial:buffer:check` passed.
- `npm run prover:ops:polynomial` passed.
- `npm run prover:testing-mode:check` passed.
- `npm run prover:stage-timing:check` passed and verified the generated proof.
- `npm run build` passed.
- `npm run prover:browser:check` passed.
- `npm pack --dry-run --json` passed with 249 files and no test, script,
  temporary, benchmark, or diagnostics paths.

## Superseded Old-Taxonomy Comparison

The old comparison below is preserved only as historical context. It must not be used as the active timing table because it used add/sub/mul/scale rows that are no longer part of the accepted taxonomy.

| old lowest operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.add` | 7.63 s | 6.28 s | -1.35 s |
| `polynomial.sub` | 15.99 s | 11.25 s | -4.74 s |
| `polynomial.mul` | 134.86 s | 130.55 s | -4.31 s |
| `polynomial.div_ruffini` | 10.81 s | 10.08 s | -0.73 s |
| `polynomial.div_vanishing` | 5.92 s | 5.64 s | -0.27 s |
| `polynomial.scale` | 41.44 s | 38.33 s | -3.11 s |
| `polynomial.encode` | 119.50 s | 114.74 s | -4.76 s |

## Superseded Artificial Split Timing

Related commit: `fbd38fe4` (`Fix prover timing taxonomy`).

Status:

- Proof generation completed.
- Generated proof verification completed.
- Timing invariant failures: `0`.
- Superseded reason: non-unit fused scaled-add operations were decomposed into separate diagnostic scale and add steps. This made the measured prover slower than the production-like path and made the report unsuitable for selecting hot-path rewrites.

| row | total |
| --- | ---: |
| prover stage total | 378.13 s |
| classified operation time | 349.08 s |
| unclassified prover time | 47.70 s |
| total wall | 396.78 s |

## Whole-Chunk WASM Linear Operations

Related commit: this commit.

The previous production path invoked scalar ffjavascript field operations once
per coefficient for general polynomial addition, subtraction, scale,
add-scaled accumulation, and X/Y coefficient scaling. This change installs a
backend-owned module plugin through the public
`getCurveFromName(..., plugins)` hook. No ffjavascript, wasmcurves,
wasmbuilder, or `node_modules` source was modified.

The accepted runtime boundary is:

- explicitly export wasmcurves' generated `frm_batchAdd` and `frm_batchSub`;
- add fused add-scaled, strided prefix add-scaled, and layout-aware X/Y scale
  kernels in backend-wasm source;
- use ffjavascript's existing `batchApplyKey(buffer, scalar, 1)` for uniform
  scaling;
- schedule disjoint chunks through the existing ffjavascript thread manager;
- validate every required WASM export during curve-runtime creation and fail
  explicitly when the pinned dependency contract is unavailable;
- preserve the existing `ffjs-fr-montgomery-le-32` representation and all
  transcript, artifact, and verifier boundaries.

The benchmark measured complete end-to-end execution, including worker data
movement and output assembly. All small, `4096x256`, and `8192x512` cases
passed exact byte parity. At `4096x256`, accepted 14-worker candidates improved
add by `14.42x`, subtract by `14.63x`, uniform scale by `9.67x`, fused
add-scaled by `18.33x`, prefix add-scaled by `15.43x`, X scaling by `16.54x`,
and Y scaling by `18.09x`. The fused add-scaled kernel was faster and required
less explicit intermediate storage than the rejected two-pass candidate.

Fixed-taxonomy timing comparison:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 53.420 s | 10.300 s | -43.120 s |
| `field.operations` | 111.487 s | 69.620 s | -41.867 s |
| prover stage total | 245.206 s | 199.570 s | -45.636 s |
| total wall | 253.738 s | 207.990 s | -45.748 s |

The first row is the direct optimization target. The total wall reduction is
similar in magnitude after unrelated field-operation variation, while
commitment encoding, initialization, I/O, and other prover work remain outside
that target.

Acceptance results:

- field-buffer, polynomial-buffer, prover polynomial, and commitment parity
  checks passed;
- native testing-mode-style arithmetic, recursion, copy quotient, and opening
  invariants passed;
- the Node timing runner generated a proof accepted by the verifier;
- Chromium generated a 2408-byte proof in `177.28 s` and verified it in
  `19 ms`;
- type checks, build, and package dry-run passed;
- package inspection found no `test/`, `scripts/`, or `tmp/` paths in the
  published file list.

## Whole-Buffer WASM Pointwise Multiplication

Related commit: this commit.

The remaining general and omega-shifted multiplication paths invoked one
JavaScript-to-WASM field multiplication per evaluation element. The accepted
implementation exports wasmcurves' existing `frm_batchMul` and adds one
layout-aware shifted multiplication kernel through the backend-owned
ffjavascript plugin. Both runtime methods shard disjoint inputs through the
existing ffjavascript thread manager and include worker input copies and
output assembly.

Representative `4096x256` end-to-end benchmark:

| workload | retained scalar | single-task WASM | worker-sharded WASM | accepted reduction |
| --- | ---: | ---: | ---: | ---: |
| generic product | 5178.222 ms | 4516.056 ms | 4304.207 ms | 16.9% |
| three shifted products | 11676.935 ms | 9629.446 ms | 8818.729 ms | 24.5% |

The generic benchmark's isolated pointwise stage measured `958.958 ms` for
the retained scalar loop, `322.108 ms` for one WASM task, and `68.986 ms` for
worker-sharded WASM. Every candidate passed small-domain independent parity
and complete inverse-NTT byte parity.

Integrated fixed-taxonomy comparison against the same-code post-reboot
baseline:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `prove0.p0XY.mul` | 6.157 s | 5.023 s | -1.134 s (-18.4%) |
| `prove2.omega_shifted_products` | 13.085 s | 10.464 s | -2.621 s (-20.0%) |
| `polynomial.combination_with_multiplication` | 31.479 s | 27.627 s | -3.852 s (-12.2%) |
| `field.operations` | 61.965 s | 57.607 s | -4.358 s (-7.0%) |
| encode | 117.843 s | 116.254 s | -1.589 s |
| prover stage total | 177.669 s | 171.893 s | -5.776 s |
| total wall | 186.308 s | 179.505 s | -6.803 s (-3.7%) |

Only the first three rows are direct optimization targets. Encode variation
is reported for transparency and is not attributed to pointwise
multiplication.

Production scope:

- generic `BivariatePolynomialBuffer.mul(...)` uses worker-sharded
  `batchMulBuffer(...)`;
- omega-shifted products use `batchMulShiftedBuffer(...)`, which reads shifted
  Y indices in WASM and copies only each worker's shifted X-row shard;
- scalar field methods, specialized X/Y univariate products, K0/KL products,
  binary formats, transcript bytes, and verifier logic are unchanged;
- the production call-site audit found no prover hot path invoking generic
  X-only or Y-only `BivariatePolynomialBuffer.mul(...)`; those specialized
  structured kernels remain in their dedicated benchmark campaign.

Verification:

- field-buffer, polynomial-buffer, prover polynomial, and commitment parity
  checks passed;
- native testing-mode-style arithmetic, recursion, copy quotient, and opening
  invariants passed;
- Node stage timing generated a proof accepted by the verifier;
- Chromium generated a 2408-byte proof in `172.55 s` and verified it in
  `18 ms`;
- type checks and build passed;
- package dry-run contained 253 files and no `test/`, `scripts/`, or `tmp/`
  paths.

## Raw-Byte Commitment Input Scan

Related commit: `c06f8844`.

The previous Sigma1 commitment boundary called scalar ffjavascript
`isZero(...)` once per coefficient while discovering the active rectangle,
counting nonzero coefficients, and compacting sparse inputs. The accepted path
interprets the existing validated `ffjs-fr-montgomery-le-32` coefficient
buffer as aligned 32-bit words and detects zero by OR-reducing the eight words
of each field element. It preserves the two-scan sparse allocation policy,
dense threshold, `262144`-point chunk size, raw conversion, and ffjavascript
MSM implementation.

The corrected diagnostics benchmark included degree discovery, initial
nonzero counting, sparse/dense routing, input preparation, Montgomery
conversion, MSM, and partial-point accumulation. At `4096x256`, 14 workers,
one warmup, and two alternating-order measured iterations:

| density | path | previous total | raw-byte total | reduction |
| ---: | --- | ---: | ---: | ---: |
| 0.00 | zero | 170.80 ms | 16.71 ms | 90.2% |
| 0.10 | sparse | 592.38 ms | 494.89 ms | 16.5% |
| 0.25 | sparse | 1304.97 ms | 1187.76 ms | 9.0% |
| 0.50 | sparse | 2437.98 ms | 2293.88 ms | 5.9% |
| 0.75 | dense | 3505.85 ms | 3434.71 ms | 2.0% |
| 1.00 | dense | 4602.13 ms | 4530.95 ms | 1.5% |

The accepted candidate used the same explicit temporary storage as the
previous path. JavaScript single-scan over-allocation and WASM compaction were
rejected because they used 128 MiB and 397-512 MiB respectively without
beating raw-byte two-scan end to end.

Integrated fixed-taxonomy comparison:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| encode | 116.254 s | 109.702 s | -6.552 s (-5.6%) |
| prover stage total | 171.893 s | 164.973 s | -6.920 s (-4.0%) |
| total wall | 179.505 s | 172.942 s | -6.563 s (-3.7%) |

The new lowest-layer `polynomial.encode` value is `107.719 s`; the exact
pre-change lowest-layer value was not retained separately, so it is not
reconstructed from the aggregate encode row.

Verification:

- type checks and field, polynomial, and commitment parity checks passed;
- native testing-mode-style witness, arithmetic, recursion, copy quotient, and
  opening invariants passed;
- Node stage timing generated a proof accepted by the verifier;
- Chromium generated a 2408-byte proof in `167.04 s` and verified it in
  `19 ms`;
- build and package dry-run passed;
- package inspection found 253 files and no `test/`, `scripts/`, `fixtures/`,
  or `tmp/` paths.

## Batched Binding Scalar Conversion

Related commit: `8ac0d692`.

The binding MSM helper previously called `toRawLittleEndian(...)` for every
scalar and then concatenated the resulting small buffers. The accepted path
concatenates the existing Montgomery field elements once and converts the
complete buffer with ffjavascript `batchFromMontgomery(...)`. Base
concatenation and `G1.multiExpAffine(...)` are unchanged.

The fixture-derived benchmark covered every binding input and required exact
G1 equality:

| binding | scalars | per-scalar total | batched total | reduction |
| --- | ---: | ---: | ---: | ---: |
| `O_pub_free` | 109 | 1.53 ms | 1.54 ms | -0.7% |
| `O_mid` | 6,820 | 12.57 ms | 11.03 ms | 12.3% |
| `O_prv` | 650,925 | 1705.12 ms | 1573.26 ms | 7.7% |

The common batched path was accepted because the sub-millisecond
`O_pub_free` difference is immaterial while both representative larger inputs
improve. Integrated fixed-taxonomy timing:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `binding.encode` | 1.984 s | 1.809 s | -0.175 s (-8.8%) |
| encode | 109.702 s | 109.625 s | -0.077 s |
| prover stage total | 164.973 s | 165.300 s | +0.327 s |
| total wall | 172.942 s | 172.570 s | -0.372 s |

Only `binding.encode` is the direct target. MSM-dominated polynomial
commitments and unrelated field-operation variation account for the aggregate
rows.

Verification:

- type checks and commitment parity passed;
- native testing-mode-style witness, arithmetic, recursion, copy quotient, and
  opening invariants passed;
- Node stage timing generated a proof accepted by the verifier;
- Chromium generated a 2408-byte proof in `167.10 s` and verified it in
  `19 ms`;
- build and package dry-run passed;
- package inspection found 253 files and no `test/`, `scripts/`, `fixtures/`,
  or `tmp/` paths.
