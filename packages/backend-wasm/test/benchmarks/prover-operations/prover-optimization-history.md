# Prover Timing Report

Audience: backend-wasm engineers measuring and optimizing prover performance.

This report uses the native-style flat accumulated timing model and presents timing bottom-up. The lowest currently measured operation buckets appear first, then higher-level totals are reconstructed from them.

## Measurement Model

The backend-wasm prover timing runner records flat accumulated events:

- Raw event fields: `name`, `category`, `durationMs`, `sizes`.
- No nested span tree, exclusive-self reconstruction, or overlapping child totals are used.
- The reported operation taxonomy is fixed. Implementation method names are raw diagnostic event names only and are not reported as operation buckets.
- The lowest operation layer is limited to `polynomial.add`, `polynomial.sub`, `polynomial.mul`, `polynomial.div_ruffini`, `polynomial.div_vanishing`, `polynomial.scale`, and `polynomial.encode`.
- The middle operation layer is limited to `polynomial.combine`, `polynomial.division`, and `polynomial.encode`.
- The top operation layer is limited to `field.operations` and `polynomial.encode`.
- `polynomial.combine = polynomial.add + polynomial.sub + polynomial.mul + polynomial.scale`.
- `polynomial.division = polynomial.div_ruffini + polynomial.div_vanishing`.
- `field.operations = polynomial.combine + polynomial.division`.
- Rows outside this fixed taxonomy are not report rows.

The timing runner enforces:

- For every `prove*` stage, `poly + encode <= total`.
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
- Current measurement commit range: before `3c7da223`, after current branch with the linear accumulation optimization and fixed timing taxonomy.

## Lowest Operation Layer

These are the only lowest-level operation buckets in the current report.

| operation | total | count |
| --- | ---: | ---: |
| polynomial.add | 6.28 s | 17 |
| polynomial.sub | 11.25 s | 20 |
| polynomial.mul | 130.55 s | 23 |
| polynomial.div_ruffini | 10.08 s | 5 |
| polynomial.div_vanishing | 5.64 s | 2 |
| polynomial.scale | 38.33 s | 79 |
| polynomial.encode | 114.74 s | 18 |

## Middle Operation Layer

| operation | definition | total | count |
| --- | --- | ---: | ---: |
| polynomial.combine | polynomial.add + polynomial.sub + polynomial.mul + polynomial.scale | 186.41 s | 139 |
| polynomial.division | polynomial.div_ruffini + polynomial.div_vanishing | 15.72 s | 7 |
| polynomial.encode | polynomial.encode | 114.74 s | 18 |

## Top Operation Layer

| operation | definition | total | count |
| --- | --- | ---: | ---: |
| field.operations | polynomial.combine + polynomial.division | 202.13 s | 146 |
| polynomial.encode | polynomial.encode | 114.74 s | 18 |

## Linear Accumulation Optimization Delta

Both sides were measured with the same fixed operation taxonomy runner. The pre-optimization run used commit `3c7da223`; the post-optimization run used the current branch.

| lowest operation | before | after | delta |
| --- | ---: | ---: | ---: |
| polynomial.add | 7.63 s | 6.28 s | -1.35 s |
| polynomial.sub | 15.99 s | 11.25 s | -4.74 s |
| polynomial.mul | 134.86 s | 130.55 s | -4.31 s |
| polynomial.div_ruffini | 10.81 s | 10.08 s | -0.73 s |
| polynomial.div_vanishing | 5.92 s | 5.64 s | -0.27 s |
| polynomial.scale | 41.44 s | 38.33 s | -3.11 s |
| polynomial.encode | 119.50 s | 114.74 s | -4.76 s |

| middle operation | before | after | delta |
| --- | ---: | ---: | ---: |
| polynomial.combine | 199.92 s | 186.41 s | -13.51 s |
| polynomial.division | 16.72 s | 15.72 s | -1.00 s |
| polynomial.encode | 119.50 s | 114.74 s | -4.76 s |

| top operation | before | after | delta |
| --- | ---: | ---: | ---: |
| field.operations | 216.64 s | 202.13 s | -14.51 s |
| polynomial.encode | 119.50 s | 114.74 s | -4.76 s |

## Execution Boundary Summary

| row | total |
| --- | ---: |
| prover stage total | 343.17 s |
| total wall | 361.86 s |

## Optimization Reporting Rule

Future prover optimization entries must use this bottom-up timing layout:

1. Lowest operation layer.
2. Middle operation layer.
3. Top operation layer.
4. Execution boundary summary.
5. Invariant status.

Do not report `poly_detail` or implementation method names as operation buckets. They are raw diagnostics only.
