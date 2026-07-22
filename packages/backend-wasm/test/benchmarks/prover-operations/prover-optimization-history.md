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
| `polynomial.div_ruffini` | Ruffini division. |
| `polynomial.div_vanishing` | Vanishing-polynomial division. |
| `polynomial.encode` | Polynomial commitment encoding, including MSM input preparation and the MSM call. |

Middle operation layer:

| operation | definition |
| --- | --- |
| `polynomial.combination` | `polynomial.combination_without_multiplication + polynomial.combination_with_multiplication` |
| `polynomial.division` | `polynomial.div_ruffini + polynomial.div_vanishing` |
| `polynomial.encode` | `polynomial.encode` |

Top operation layer:

| operation | definition |
| --- | --- |
| `field.operations` | `polynomial.combination + polynomial.division` |
| `polynomial.encode` | `polynomial.encode` |

The runner enforces:

- Every `prove*` diagnostic stage satisfies `poly + encode <= total`.
- Old lowest-layer categories such as `polynomial.add`, `polynomial.sub`, `polynomial.mul`, `polynomial.scale`, and `polynomial.combine` are absent.
- Middle and top rows are derived from lower-layer totals.
- `classified operation time <= total wall time + tolerance`.
- `unclassified prover time >= -tolerance`.

## Active Linear Accumulation Comparison

This is the active before/after comparison. Both runs use the same production-like five-row timing taxonomy.

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
- After: current branch with the production-like five-row timing taxonomy.

Status:

- Before proof generation completed and generated proof verification completed.
- After proof generation completed and generated proof verification completed.
- Timing invariant failures: `0` in both runs.

Lowest operation layer:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 66.78 s | 58.32 s | -8.46 s |
| `polynomial.combination_with_multiplication` | 135.62 s | 127.97 s | -7.65 s |
| `polynomial.div_ruffini` | 10.51 s | 10.26 s | -0.25 s |
| `polynomial.div_vanishing` | 5.98 s | 5.61 s | -0.37 s |
| `polynomial.encode` | 118.02 s | 114.17 s | -3.85 s |

Middle operation layer:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination` | 202.41 s | 186.29 s | -16.12 s |
| `polynomial.division` | 16.49 s | 15.87 s | -0.62 s |
| `polynomial.encode` | 118.02 s | 114.17 s | -3.85 s |

Top operation layer:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `field.operations` | 218.89 s | 202.16 s | -16.73 s |
| `polynomial.encode` | 118.02 s | 114.17 s | -3.85 s |

Execution boundary:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| prover stage total | 361.65 s | 340.42 s | -21.23 s |
| classified operation time | 336.91 s | 316.33 s | -20.58 s |
| unclassified prover time | 44.16 s | 43.16 s | -1.00 s |
| total wall | 381.08 s | 359.49 s | -21.59 s |

Interpretation:

- The production linear accumulation rewrite reduced total wall time by 21.59 s under the active taxonomy.
- The main measured improvement is in `polynomial.combination`, down 16.12 s.
- `polynomial.combination_with_multiplication` also decreased by 7.65 s, but that bucket still contains multiplication-heavy call sites and remains the largest active optimization target at 127.97 s.
- `polynomial.encode` remains the second largest active bucket at 114.17 s.

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
