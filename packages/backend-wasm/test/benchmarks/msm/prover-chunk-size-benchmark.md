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

## Reboot Peak RSS Rerun

After a system reboot, peak process RSS was measured again for the active
benchmark target range. Runtime duration was not used as a decision signal in
this rerun; each row only required browser proof generation and browser verifier
acceptance.

| chunk points | value | peak total RSS | peak single RSS | verifier result |
| ---: | ---: | ---: | ---: | --- |
| 16,384 | `1 << 14` | 17.68 GiB | 17.48 GiB | passed |
| 32,768 | `1 << 15` | 17.89 GiB | 17.69 GiB | passed |
| 65,536 | `1 << 16` | 18.14 GiB | 17.94 GiB | passed |
| 131,072 | `1 << 17` | 18.28 GiB | 18.09 GiB | passed |
| 262,144 | `1 << 18` | 18.06 GiB | 17.86 GiB | passed |
| 524,288 | `1 << 19` | 20.29 GiB | 20.10 GiB | passed |

The reboot rerun confirms that the prover has a large baseline browser-process
RSS footprint even at 16,384 points, and that 524,288 points still has a clear
memory jump over the smaller active candidates. The 262,144-point row did not
increase peak RSS over the 131,072-point row in this rerun, which should be
treated as normal process-level RSS noise rather than proof that larger chunks
always reduce memory.

## Final Optimized-Prover Rerun

After completing the currently executable prover hot-path campaign through
Priority 24I, the same active chunk range was remeasured. Chromium RSS was
sampled every two seconds. Every row generated a 2408-byte proof and passed
in-browser verifier acceptance. One initial 16,384-point run was excluded
because the measurement wrapper failed after proof completion before
preserving its peak values; the row below is the clean rerun.

| chunk points | prove binary time | peak total RSS | peak single RSS | verifier result |
| ---: | ---: | ---: | ---: | --- |
| 16,384 | 156.55 s | 13.35 GiB | 13.15 GiB | passed |
| 32,768 | 146.13 s | 13.03 GiB | 12.83 GiB | passed |
| 65,536 | 142.62 s | 12.61 GiB | 12.41 GiB | passed |
| 131,072 | 140.54 s | 12.45 GiB | 12.25 GiB | passed |
| 262,144 | 137.32 s | 13.50 GiB | 13.30 GiB | passed |
| 524,288 | 137.51 s | 14.46 GiB | 14.26 GiB | passed |

The process-level RSS values are noisy across sequential runs, especially
below 262,144 points, and must not be interpreted as a monotonic allocation
curve. The high-end decision is nevertheless clear on this machine:
524,288 points provides no time improvement over 262,144 points and adds
approximately 0.96 GiB of observed peak total RSS. Retaining 262,144 points is
the technical recommendation. The production constant remains unchanged while
the project owner decides whether to accept that recommendation as the final
default for unknown user hardware.

## Final All-Approved Optimization Rerun

After promoting every project-owner-approved Priority 32 candidate, the full
active range was measured again on 2026-07-26. The method remained the same,
except Chromium RSS was sampled every one second. Every row generated a
2408-byte proof and passed verifier acceptance in the same browser session.
The production constant was restored to `262144` immediately after the final
run.

| chunk points | prove binary time | peak total RSS | peak single RSS | verifier result |
| ---: | ---: | ---: | ---: | --- |
| 16,384 | 139.06 s | 9.88 GiB | 9.68 GiB | passed |
| 32,768 | 129.57 s | 10.74 GiB | 10.54 GiB | passed |
| 65,536 | 126.02 s | 9.86 GiB | 9.66 GiB | passed |
| 131,072 | 124.52 s | 9.92 GiB | 9.73 GiB | passed |
| 262,144 | 121.25 s | 10.22 GiB | 10.02 GiB | passed |
| 524,288 | 121.39 s | 11.71 GiB | 11.51 GiB | passed |

The lower-range RSS observations remain non-monotonic process-level samples.
They cannot establish a portable memory formula for unknown user systems.
The high-end comparison is decisive on this machine: `524288` is `0.14 s`
slower than `262144` while increasing observed peak total RSS by `1.49 GiB`.
Compared with `16384`, `262144` reduces proof time by `17.81 s` (`12.8%`)
while the observed peak total RSS differs by `0.34 GiB`.

The final technical recommendation remains `262144`. It is the fastest
measured candidate, avoids the high-end RSS jump, and is already the production
value. Selecting it as the final default still requires the project owner
because this local result cannot guarantee safety for every browser and user
hardware configuration.
