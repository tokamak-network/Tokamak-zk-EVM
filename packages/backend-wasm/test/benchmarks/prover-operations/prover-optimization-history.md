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

## Lowest Operation Layer

These are the only lowest-level operation buckets in the current report.

| operation | total | count |
| --- | ---: | ---: |
| polynomial.add | 42.10 s | 79 |
| polynomial.sub | 13.08 s | 16 |
| polynomial.mul | 111.37 s | 29 |
| polynomial.div_ruffini | 12.18 s | 5 |
| polynomial.div_vanishing | 5.88 s | 2 |
| polynomial.scale | 7.83 s | 23 |
| polynomial.encode | 112.80 s | 17 |

## Middle Operation Layer

| operation | definition | total | count |
| --- | --- | ---: | ---: |
| polynomial.combine | polynomial.add + polynomial.sub + polynomial.mul + polynomial.scale | 174.38 s | 147 |
| polynomial.division | polynomial.div_ruffini + polynomial.div_vanishing | 18.07 s | 7 |
| polynomial.encode | polynomial.encode | 112.80 s | 17 |

## Top Operation Layer

| operation | definition | total | count |
| --- | --- | ---: | ---: |
| field.operations | polynomial.combine + polynomial.division | 192.44 s | 154 |
| polynomial.encode | polynomial.encode | 112.80 s | 17 |

## Execution Boundary Summary

| row | total |
| --- | ---: |
| prover stage total | 348.96 s |
| total wall | 368.34 s |

## Optimization Reporting Rule

Future prover optimization entries must use this bottom-up timing layout:

1. Lowest operation layer.
2. Middle operation layer.
3. Top operation layer.
4. Execution boundary summary.
5. Invariant status.

Do not report `poly_detail` or implementation method names as operation buckets. They are raw diagnostics only.
