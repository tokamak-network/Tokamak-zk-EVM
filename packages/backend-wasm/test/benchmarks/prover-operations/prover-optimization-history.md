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

## Initial Post-Optimization Timing

Command:

```bash
npm run prover:stage-timing:check
```

Status:

- Proof generation completed.
- Generated proof verification completed.
- Timing invariant failures: `0`.
- Current measurement commit range: before `3c7da223`, after the branch with the linear accumulation optimization and the first fixed timing taxonomy.
- Superseded status: this timing table used the old add/sub/mul/scale taxonomy and is not valid current evidence.

Lowest layer:

| operation | total | count |
| --- | ---: | ---: |
| `polynomial.add` | 6.28 s | 17 |
| `polynomial.sub` | 11.25 s | 20 |
| `polynomial.mul` | 130.55 s | 23 |
| `polynomial.div_ruffini` | 10.08 s | 5 |
| `polynomial.div_vanishing` | 5.64 s | 2 |
| `polynomial.scale` | 38.33 s | 79 |
| `polynomial.encode` | 114.74 s | 18 |

Middle layer:

| operation | total | count |
| --- | ---: | ---: |
| `polynomial.combine` | 186.41 s | 139 |
| `polynomial.division` | 15.72 s | 7 |
| `polynomial.encode` | 114.74 s | 18 |

Top layer:

| operation | total | count |
| --- | ---: | ---: |
| `field.operations` | 202.13 s | 146 |
| `polynomial.encode` | 114.74 s | 18 |

Execution boundary:

| row | total |
| --- | ---: |
| prover stage total | 343.17 s |
| total wall | 361.86 s |

## Linear Accumulation Optimization Delta

Both sides used the same old add/sub/mul/scale taxonomy, so this table is only historical evidence that the linear accumulation rewrite improved the integrated prover. It is not the active taxonomy for future candidate selection.

| lowest operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.add` | 7.63 s | 6.28 s | -1.35 s |
| `polynomial.sub` | 15.99 s | 11.25 s | -4.74 s |
| `polynomial.mul` | 134.86 s | 130.55 s | -4.31 s |
| `polynomial.div_ruffini` | 10.81 s | 10.08 s | -0.73 s |
| `polynomial.div_vanishing` | 5.92 s | 5.64 s | -0.27 s |
| `polynomial.scale` | 41.44 s | 38.33 s | -3.11 s |
| `polynomial.encode` | 119.50 s | 114.74 s | -4.76 s |

| middle operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combine` | 199.92 s | 186.41 s | -13.51 s |
| `polynomial.division` | 16.72 s | 15.72 s | -1.00 s |
| `polynomial.encode` | 119.50 s | 114.74 s | -4.76 s |

| top operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `field.operations` | 216.64 s | 202.13 s | -14.51 s |
| `polynomial.encode` | 119.50 s | 114.74 s | -4.76 s |

## Superseded Artificial Split Timing

Command:

```bash
npm run prover:stage-timing:check
```

Related commit: `fbd38fe4` (`Fix prover timing taxonomy`).

Status:

- Proof generation completed.
- Generated proof verification completed.
- Timing invariant failures: `0`.
- Superseded reason: non-unit fused scaled-add operations were decomposed into separate diagnostic scale and add steps. This made the measured prover slower than the production-like path and made the report unsuitable for selecting hot-path rewrites.

Lowest layer:

| operation | total | count |
| --- | ---: | ---: |
| `polynomial.add` | 51.96 s | 78 |
| `polynomial.sub` | 10.96 s | 20 |
| `polynomial.mul` | 128.03 s | 23 |
| `polynomial.div_ruffini` | 10.03 s | 5 |
| `polynomial.div_vanishing` | 5.62 s | 2 |
| `polynomial.scale` | 25.62 s | 73 |
| `polynomial.encode` | 116.86 s | 18 |

Execution boundary:

| row | total |
| --- | ---: |
| prover stage total | 378.13 s |
| classified operation time | 349.08 s |
| unclassified prover time | 47.70 s |
| total wall | 396.78 s |

## Production-Like Timing Taxonomy Correction

Command:

```bash
npm run prover:stage-timing:check
```

Related commit: this commit (`Use production-like prover timing taxonomy`).

Status:

- Proof generation completed.
- Generated proof verification completed.
- Timing invariant failures: `0`.
- Correction: official lowest-layer rows now use five production-like operation buckets.
- Correction: fused polynomial combination work is measured at its production-like call-site boundary.
- Correction: middle and top layers are derived from lower-layer totals, not directly measured spans.

Lowest layer:

| operation | total | count |
| --- | ---: | ---: |
| `polynomial.combination_without_multiplication` | 58.32 s | 61 |
| `polynomial.combination_with_multiplication` | 127.97 s | 23 |
| `polynomial.div_ruffini` | 10.26 s | 5 |
| `polynomial.div_vanishing` | 5.61 s | 2 |
| `polynomial.encode` | 114.17 s | 18 |

Middle layer:

| operation | total | count |
| --- | ---: | ---: |
| `polynomial.combination` | 186.29 s | 84 |
| `polynomial.division` | 15.87 s | 7 |
| `polynomial.encode` | 114.17 s | 18 |

Top layer:

| operation | total | count |
| --- | ---: | ---: |
| `field.operations` | 202.16 s | 91 |
| `polynomial.encode` | 114.17 s | 18 |

Execution boundary:

| row | total |
| --- | ---: |
| prover stage total | 340.42 s |
| classified operation time | 316.33 s |
| unclassified prover time | 43.16 s |
| total wall | 359.49 s |

Interpretation:

- This is the active baseline for selecting the next prover optimization candidate.
- Compared with the superseded artificial split timing, total wall time decreased from 396.78 s to 359.49 s because the runner no longer decomposes fused production work.
- The largest active bucket is `polynomial.combination_with_multiplication` at 127.97 s, followed by `polynomial.encode` at 114.17 s.
