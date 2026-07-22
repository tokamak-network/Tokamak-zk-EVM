# Prover Timing Report

Audience: backend-wasm engineers measuring and optimizing prover performance.

This report uses the native-style flat accumulated timing model and presents timing bottom-up. The lowest currently measured operation buckets appear first, then higher-level totals are reconstructed from them.

## Measurement Model

The backend-wasm prover timing runner records flat accumulated events:

- Raw event fields: `name`, `category`, `durationMs`, `sizes`.
- No nested span tree, exclusive-self reconstruction, or overlapping child totals are used.
- `poly.combine` primitive rows are direct low-level calls inside `poly.combine.*` spans.
- Nested low-level calls are intentionally not recorded.
- Each `poly.combine.*` target is reconstructed as `primitive detail + remaining = parent combine`.
- Polynomial work is reconstructed as `poly.combine + poly.division = poly`.
- Module work is reconstructed as `poly + encode + unclassified = module total`.
- Total runtime is reconstructed as `stage total + non-stage setup/io/verify/output = total wall`.

The timing runner enforces:

- For every `prove*` stage, `poly + encode <= total`.
- For every `poly.combine.*` target, primitive detail total must be less than or equal to parent combine time.
- If an invariant fails, `npm run prover:stage-timing:check` fails.

Diagnostics remain outside the published package:

- Runner: `scripts/check/prover/check-prover-stage-timing.ts`
- JSON output: `tmp/timing/prover-stage-timing.json`
- Markdown output: `tmp/timing/prover-stage-timing.md`
- `tmp/`, `scripts/`, and `test/` are not included in the package `files` whitelist.

## Current Timing

Command:

```bash
npm run prover:stage-timing:check
```

Result:

- Proof generation completed.
- Generated proof verification completed.
- Timing invariant failures: `0`.

## Primitive Operation Buckets

These are the lowest-level timing buckets in the current report. They are used to reconstruct higher layers.

| primitive bucket | total | count |
| --- | ---: | ---: |
| poly.combine.mul | 79.42 s | 8 |
| poly.combine.addScaledPrefixAssign | 32.44 s | 65 |
| poly.combine.toRouEvals | 17.49 s | 3 |
| poly.combine.sub | 12.36 s | 15 |
| poly.combine.static_fromRouEvals | 12.12 s | 6 |
| poly.combine.add | 9.66 s | 14 |
| poly.combine.scale | 6.72 s | 19 |
| poly.combine.mulMonomial | 2.35 s | 12 |
| poly.combine.subAssign | 724 ms | 1 |
| poly.combine.scaleCoeffsY | 564 ms | 2 |
| poly.combine.scaleCoeffsX | 545 ms | 2 |
| poly.combine.resize | 374 ms | 8 |
| poly.combine.static_fromCoeffs | 0 ms | 3 |
| poly.combine.static_zero | 0 ms | 4 |
| poly.combine.findDegree | 0 ms | 4 |
| poly.combine.remaining | 9.82 s | - |
| poly.div_by_ruffini | 12.18 s | 5 |
| poly.div_by_vanishing_opt | 5.88 s | 2 |
| encode.commit | 112.80 s | 18 |

## Polynomial Time Reconstruction

| reconstruction row | total |
| --- | ---: |
| sum(poly.combine primitives) | 174.75 s |
| poly.combine remaining | 9.82 s |
| poly.combine total | 184.57 s |
| poly division total | 18.07 s |
| total poly | 202.63 s |

## Poly Combine Coverage By Target

| module | variable | primitive detail | remaining | parent combine | coverage |
| --- | --- | ---: | ---: | ---: | ---: |
| prove2 | shared_f_products | 29.86 s | 2.24 s | 32.10 s | 93.0% |
| prove0 | p0XY | 20.96 s | 0 ms | 20.96 s | 100.0% |
| prove2 | p1 | 19.88 s | 0 ms | 19.88 s | 100.0% |
| prove2 | rG | 19.26 s | 0 ms | 19.26 s | 100.0% |
| prove2 | Q_CY | 14.23 s | 110 ms | 14.34 s | 99.2% |
| prove2 | Q_CX | 10.07 s | 494 ms | 10.57 s | 95.3% |
| prove4 | LHS_zk2 | 9.98 s | 1.12 s | 11.10 s | 89.9% |
| prove2 | p3 | 9.37 s | 0 ms | 9.37 s | 100.0% |
| prove4 | LHS_zk1 | 7.05 s | 976 ms | 8.03 s | 87.8% |
| prove2 | p_comb | 5.40 s | 208 ms | 5.61 s | 96.3% |
| prove4 | Pi_A | 4.79 s | 964 ms | 5.75 s | 83.2% |
| prove4 | pC | 4.64 s | 319 ms | 4.96 s | 93.6% |
| prove4 | LHS_for_copy | 4.59 s | 1.86 s | 6.44 s | 71.2% |
| prove2 | p2 | 2.04 s | 0 ms | 2.04 s | 100.0% |
| prove2 | p2_input | 1.49 s | 0 ms | 1.49 s | 100.0% |
| prove2 | lagrange_KL | 1.01 s | 0 ms | 1.01 s | 100.0% |
| prove0 | Q_AY | 948 ms | 108 ms | 1.06 s | 89.8% |
| prove4 | fXY | 834 ms | 43 ms | 877 ms | 95.1% |
| prove2 | fXY | 820 ms | 40 ms | 860 ms | 95.4% |
| prove4 | R_minus_eval | 790 ms | 0 ms | 790 ms | 100.0% |
| prove0 | Q_AX | 782 ms | 191 ms | 973 ms | 80.3% |
| prove0 | W | 737 ms | 83 ms | 819 ms | 89.9% |
| prove0 | B | 717 ms | 74 ms | 791 ms | 90.7% |

## Module Time Reconstruction

| module | poly | encode | unclassified | total |
| --- | ---: | ---: | ---: | ---: |
| prove0 | 26.77 s | 38.37 s | 1 ms | 65.15 s |
| prove1 | 0 ms | 0 ms | 22.48 s | 22.48 s |
| prove2 | 122.22 s | 32.64 s | 1 ms | 154.86 s |
| prove3 | 0 ms | 0 ms | 8.68 s | 8.68 s |
| prove4 | 53.64 s | 41.78 s | 2.38 s | 97.80 s |

## Total Time Reconstruction

| row | total |
| --- | ---: |
| prover stage total | 348.96 s |
| non-stage setup/io/verify/output | 19.37 s |
| total wall | 368.34 s |

## Optimization Reporting Rule

Future prover optimization entries must use this bottom-up timing layout:

1. Primitive operation buckets.
2. Polynomial time reconstruction.
3. Poly combine target coverage.
4. Module time reconstruction.
5. Total time reconstruction.
6. Invariant status.

Do not report `poly_detail` as a top-level category beside `poly`, `encode`, or `stage`. It is a primitive breakdown of `poly.combine.*`.
