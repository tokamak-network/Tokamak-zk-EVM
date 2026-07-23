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
