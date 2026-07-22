# Prover Timing Report

Audience: backend-wasm engineers measuring and optimizing prover performance.

This report replaces the previous nested-span timing report. The previous `wallClock`, `exclusiveSelf`, and `nestedDiagnostics` model is discarded because it made nested diagnostic totals easy to compare against parent wall-clock totals incorrectly.

## Measurement Model

The backend-wasm prover timing runner now follows the native prover timing-report model:

- Timing is recorded as flat accumulated events.
- Each event has only `name`, `category`, `durationMs`, and `sizes`.
- Module totals are measured by the outer `prove0` through `prove4` stage events.
- `poly` totals are accumulated from explicit high-level polynomial events such as `poly.combine.*`, `poly.div_by_ruffini.*`, and `poly.div_by_vanishing_opt.*`.
- `encode` totals are accumulated from polynomial commitment MSM events.
- `poly_detail` records only direct low-level calls inside `poly.combine.*` spans.
- Nested low-level calls are not recorded, so detail totals do not double-count their parent operation.
- `poly_detail` is reported separately from `poly` totals and must not be added to module totals.

The timing runner enforces these invariants:

- For every `prove*` stage, `poly + encode <= total`.
- For every `poly.combine.*` target, the sum of its `poly_detail.*` rows is less than or equal to the parent `poly.combine.*` time.
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

Generated outputs:

- `tmp/timing/prover-stage-timing.json`
- `tmp/timing/prover-stage-timing.md`

Result:

- Proof generation completed.
- Generated proof verification completed.
- Timing invariant failures: `0`.

## Total Time

| item | value |
| --- | ---: |
| total_wall | 368.34 s |

## Module Times

| module | total | poly | encode | unclassified |
| --- | ---: | ---: | ---: | ---: |
| prove0 | 65.15 s | 26.77 s | 38.37 s | 1 ms |
| prove1 | 22.48 s | 0 ms | 0 ms | 22.48 s |
| prove2 | 154.86 s | 122.22 s | 32.64 s | 1 ms |
| prove3 | 8.68 s | 0 ms | 0 ms | 8.68 s |
| prove4 | 97.80 s | 53.64 s | 41.78 s | 2.38 s |

## Top-Level Category Totals

| category | total | count |
| --- | ---: | ---: |
| stage | 348.96 s | 5 |
| poly | 202.63 s | 53 |
| encode | 114.89 s | 18 |
| init | 16.13 s | 2 |
| io | 1.12 s | 2 |
| verify | 18 ms | 1 |
| output | 3 ms | 1 |

`poly_detail` is intentionally excluded from this table because it is a drill-down of direct low-level calls inside `poly.combine.*` targets, not a top-level category. It is reported only in the detail tables below.

## Poly Operation Totals

| operation | total | count |
| --- | ---: | ---: |
| combine | 184.57 s | 46 |
| div_by_ruffini | 12.18 s | 5 |
| div_by_vanishing_opt | 5.88 s | 2 |

## Poly Combine Detail Totals

| detail operation | total | count |
| --- | ---: | ---: |
| mul | 79.42 s | 8 |
| addScaledPrefixAssign | 32.44 s | 65 |
| toRouEvals | 17.49 s | 3 |
| sub | 12.36 s | 15 |
| static_fromRouEvals | 12.12 s | 6 |
| add | 9.66 s | 14 |
| scale | 6.72 s | 19 |
| mulMonomial | 2.35 s | 12 |
| subAssign | 724 ms | 1 |
| scaleCoeffsY | 564 ms | 2 |
| scaleCoeffsX | 545 ms | 2 |
| resize | 374 ms | 8 |
| static_fromCoeffs | 0 ms | 3 |
| static_zero | 0 ms | 4 |
| findDegree | 0 ms | 4 |

## Poly Combine Detail By Target

| module | variable | parent poly | detail total | remaining |
| --- | --- | ---: | ---: | ---: |
| prove2 | shared_f_products | 32.10 s | 29.86 s | 2.24 s |
| prove0 | p0XY | 20.96 s | 20.96 s | 0 ms |
| prove2 | p1 | 19.88 s | 19.88 s | 0 ms |
| prove2 | rG | 19.26 s | 19.26 s | 0 ms |
| prove2 | Q_CY | 14.34 s | 14.23 s | 110 ms |
| prove2 | Q_CX | 10.57 s | 10.07 s | 494 ms |
| prove4 | LHS_zk2 | 11.10 s | 9.98 s | 1.12 s |
| prove2 | p3 | 9.37 s | 9.37 s | 0 ms |
| prove4 | LHS_zk1 | 8.03 s | 7.05 s | 976 ms |
| prove2 | p_comb | 5.61 s | 5.40 s | 208 ms |
| prove4 | Pi_A | 5.75 s | 4.79 s | 964 ms |
| prove4 | pC | 4.96 s | 4.64 s | 319 ms |
| prove4 | LHS_for_copy | 6.44 s | 4.59 s | 1.86 s |
| prove2 | p2 | 2.04 s | 2.04 s | 0 ms |
| prove2 | p2_input | 1.49 s | 1.49 s | 0 ms |
| prove2 | lagrange_KL | 1.01 s | 1.01 s | 0 ms |
| prove0 | Q_AY | 1.06 s | 948 ms | 108 ms |
| prove4 | fXY | 877 ms | 834 ms | 43 ms |
| prove2 | fXY | 860 ms | 820 ms | 40 ms |
| prove4 | R_minus_eval | 790 ms | 790 ms | 0 ms |
| prove0 | Q_AX | 973 ms | 782 ms | 191 ms |
| prove0 | W | 819 ms | 737 ms | 83 ms |
| prove0 | B | 791 ms | 717 ms | 74 ms |
| prove4 | term6 | 655 ms | 409 ms | 246 ms |
| prove4 | gMinusF | 400 ms | 400 ms | 0 ms |
| prove2 | gD | 394 ms | 394 ms | 0 ms |
| prove2 | rD2 | 394 ms | 394 ms | 0 ms |
| prove4 | term5 | 632 ms | 389 ms | 243 ms |
| prove4 | rD2 | 386 ms | 386 ms | 0 ms |
| prove4 | rD1 | 386 ms | 386 ms | 0 ms |
| prove2 | rD1 | 369 ms | 369 ms | 0 ms |
| prove4 | r_omega_x | 289 ms | 289 ms | 0 ms |
| prove4 | r_omega_x_omega_y | 283 ms | 283 ms | 0 ms |
| prove2 | r_omega_x_omega_y | 282 ms | 282 ms | 0 ms |
| prove2 | r_omega_x | 256 ms | 256 ms | 0 ms |
| prove4 | term10 | 241 ms | 241 ms | 0 ms |
| prove4 | R | 104 ms | 8 ms | 95 ms |
| prove0 | V | 76 ms | 5 ms | 71 ms |
| prove0 | U | 101 ms | 5 ms | 96 ms |
| prove4 | V | 76 ms | 4 ms | 72 ms |
| prove4 | lagrange_K0 | 3 ms | 3 ms | 0 ms |
| prove2 | lagrange_K0 | 2 ms | 2 ms | 0 ms |
| prove0 | W_zk | 36 ms | 0 ms | 35 ms |
| prove0 | term_B_zk | 40 ms | 0 ms | 40 ms |
| prove4 | gXY | 44 ms | 0 ms | 44 ms |
| prove2 | gXY | 42 ms | 0 ms | 42 ms |

## Optimization Reporting Rule

Future prover optimization entries must use this flat accumulated timing model only.

Each optimization report must include:

- related commits.
- the exact command used for timing.
- module timing before and after, if a before run is required.
- poly operation totals before and after, if affected.
- poly combine detail totals before and after, if affected.
- invariant check status.

Do not report nested spans, exclusive-self reconstructions, or any table where child rows can sum to more than the parent row.
