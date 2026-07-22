# Prover Dense MSM Chunk Size Benchmark

Audience: backend-wasm maintainers and prover performance engineers.

This note records a Chromium full-prover benchmark for the dense `sigma1.xy-powers`
MSM chunk size used by `encodePolynomialBufferWithSigma1(...)`.

## Purpose

The prover currently bounds large dense commitment MSM calls before passing them
to ffjavascript. Smaller chunks reduce browser worker clone pressure, while
larger chunks reduce the number of external MSM calls and partial G1 additions.
This benchmark measures the full browser prover time at several chunk sizes.
It also records observed peak RSS for the `chrome-headless-shell` process group.

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
- Memory sampling: during each run, `ps` sampled `chrome-headless-shell` RSS
  every two seconds. The table reports both total RSS across matching headless
  Chromium processes and the largest single matching process RSS. These are
  process-level RSS observations, not JavaScript heap-only measurements.
- Excluded candidate: 1,048,576 points is not part of this benchmark set by
  project-owner decision.

## Results

| chunk points | value | prove binary time | peak total RSS | peak single RSS | verifier result |
| ---: | ---: | ---: | ---: | ---: | --- |
| 16,384 | `1 << 14` | 408.01 s | 17.29 GiB | 17.09 GiB | passed |
| 32,768 | `1 << 15` | 396.12 s | 17.75 GiB | 17.55 GiB | passed |
| 65,536 | `1 << 16` | 393.56 s | 17.90 GiB | 17.70 GiB | passed |
| 131,072 | `1 << 17` | 387.96 s | 18.01 GiB | 17.81 GiB | passed |
| 262,144 | `1 << 18` | 384.92 s | 18.51 GiB | 18.31 GiB | passed |
| 524,288 | `1 << 19` | 387.97 s | 22.10 GiB | 21.90 GiB | passed |

## Interpretation

For this local RSS-instrumented Chromium rerun, increasing the dense MSM chunk
size from 16,384 to 262,144 points reduced full prover time by 23.09 seconds,
or about 5.7% relative to the 16,384-point baseline.

The timing improvement is not monotonic across the full measured range.
524,288 points completed and verified, but it was slower than 262,144 points in
this rerun and increased peak total RSS sharply.

| transition | time saved | peak total RSS increase |
| --- | ---: | ---: |
| 16,384 -> 32,768 | 11.89 s | 0.46 GiB |
| 32,768 -> 65,536 | 2.56 s | 0.15 GiB |
| 65,536 -> 131,072 | 5.60 s | 0.11 GiB |
| 131,072 -> 262,144 | 3.04 s | 0.50 GiB |
| 262,144 -> 524,288 | -3.05 s | 3.59 GiB |

The result shows that the chunk size affects full prover performance, but it is
not the dominant prover bottleneck. The best measured RSS-instrumented run saves
about 23 seconds out of roughly 408 seconds. The memory cost becomes substantial
at 524,288 points without producing a better time in this rerun.

## Production Consequence

This benchmark does not by itself change the production default. A larger
default chunk size should require an explicit owner decision because it increases
browser worker message size and peak memory pressure. The measured local machine
can complete 524,288-point chunks, but 262,144 points is the best local
time/memory point in this RSS-instrumented rerun. This does not prove either
setting is safe across target browsers and user hardware.
