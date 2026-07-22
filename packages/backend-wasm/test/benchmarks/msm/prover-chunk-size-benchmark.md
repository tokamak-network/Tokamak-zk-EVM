# Prover Dense MSM Chunk Size Benchmark

Audience: backend-wasm maintainers and prover performance engineers.

This note records a Chromium full-prover benchmark for the dense `sigma1.xy-powers`
MSM chunk size used by `encodePolynomialBufferWithSigma1(...)`.

## Purpose

The prover currently bounds large dense commitment MSM calls before passing them
to ffjavascript. Smaller chunks reduce browser worker clone pressure, while
larger chunks reduce the number of external MSM calls and partial G1 additions.
This benchmark measures the full browser prover time at several chunk sizes.

## Method

- Command: `npm run prover:browser:check`
- Environment:
  - OS: Darwin 25.5.0 arm64
  - Node.js: v26.0.0
  - Playwright: 1.61.1
- Fixture: existing browser prover check fixture.
- Runtime mode: production default `createCurveRuntime()`.
- Verification gate: each run had to generate a proof and verify that proof in
  Chromium.
- Temporary change: only `SIGMA1_DENSE_MSM_CHUNK_POINTS` was changed between
  runs. The production source was restored to `1 << 14` after measurement.

## Results

| chunk points | value | prove binary time | verifier result |
| ---: | ---: | ---: | --- |
| 16,384 | `1 << 14` | 407.62 s | passed |
| 32,768 | `1 << 15` | 396.68 s | passed |
| 65,536 | `1 << 16` | 392.64 s | passed |
| 131,072 | `1 << 17` | 390.84 s | passed |
| 262,144 | `1 << 18` | 385.54 s | passed |
| 524,288 | `1 << 19` | 383.45 s | passed |
| 1,048,576 | `1 << 20` | did not complete within about 20 minutes | interrupted |

## Interpretation

For this local Chromium run, increasing the dense MSM chunk size from 16,384 to
524,288 points reduced full prover time by 24.17 seconds, or about 5.9% relative
to the 16,384-point baseline.

The improvement is monotonic across the tested range, but the marginal gain
shrinks as the chunk size increases:

| transition | time saved |
| --- | ---: |
| 16,384 -> 32,768 | 10.94 s |
| 32,768 -> 65,536 | 4.04 s |
| 65,536 -> 131,072 | 1.80 s |
| 131,072 -> 262,144 | 5.30 s |
| 262,144 -> 524,288 | 2.09 s |

The result shows that the chunk size affects full prover performance, but it is
not the dominant prover bottleneck. Even the largest tested chunk saves only
about 24 seconds out of roughly 408 seconds.

The next larger candidate, 1,048,576 points, did not fail immediately, but it
did not complete within about 20 minutes and was interrupted. During that run,
the headless Chromium process RSS was observed around `14,066,016 KiB`
(`13.4 GiB`). CPU usage was low while the process remained alive, which is
consistent with heavy browser memory pressure, GC, or ffjavascript worker-copy
overhead rather than useful prover progress.

For this local system, the largest full-prover chunk size confirmed to complete
and verify is therefore 524,288 points. The 1,048,576-point candidate is not
accepted as a safe executable setting for this benchmark.

## Production Consequence

This benchmark does not by itself change the production default. A larger
default chunk size should require an explicit owner decision because it increases
browser worker message size and peak memory pressure. The measured local machine
can complete 524,288-point chunks. The same local machine did not complete the
1,048,576-point candidate within the practical benchmark window. This does not
prove the same 524,288-point setting is safe across target browsers and user
hardware.
