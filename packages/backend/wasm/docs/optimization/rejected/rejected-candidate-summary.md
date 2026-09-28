# Rejected Optimization Candidates

Audience: backend-wasm maintainers deciding whether an old prover optimization
idea has enough new evidence to be reconsidered.

This report preserves representative evidence for rejected benchmark
implementations. The executable candidate code is scheduled for deletion rather
than retention for reproducibility. Commands below are historical invocation
records and may no longer exist in `package.json` after that cleanup.

## Reopening Rule

A rejected candidate may be reconsidered only with a new production-relevant
workload, an independent parity oracle, end-to-end timing, and peak-memory
evidence. A microbenchmark improvement alone is insufficient.

## Outer Worker MSM Scheduling

The backend-owned Web Worker scheduler, CRS-sharded worker experiment, and
SharedArrayBuffer design are documented in
[Outer Worker MSM](./outer-worker-msm.md).

They were rejected because ffjavascript primitive parallelism was faster,
worker WASM memories were independent, and the wrapper duplicated runtime,
CRS, and API complexity. The production runtime continues to use
`singleThread: false` without a second backend-owned scheduler.

## Unbounded Dense MSM

Historical experiment: remove the prover's outer dense MSM chunk limit and
submit the complete dense commitment to one ffjavascript MSM call.

The Chromium proof did not complete within 1,800 seconds. Bounded calls using
`262144` points remained operationally safe and faster. Memory was observed
for bounded candidates in [Chunk Size Decision](../chunk-size-decision.md);
the timed-out unbounded run did not produce a valid peak measurement.

## Global Projective Conversion

Historical command:

```bash
npm run bench:msm -- --lengths=4,8,16,32,64,128,256,512,1024,2048,4096,8192,16384,32768,65536 --iterations=1 --warmup=1
```

At length `65536`, affine raw MSM measured `2913.222 ms` and projective raw
MSM measured `2921.116 ms`. Projective won only at some lengths and its margin
was small and non-monotonic. Exact G1 parity passed.

The candidate was rejected as a global representation policy. Production
chooses primitives from the existing input form and does not convert all points
solely to select a group API. No separate peak-memory result was retained.

## Commitment Scan And Compaction

Historical command:

```bash
npm run bench:commitment-density -- --shapes=4096x256 --densities=0,0.1,0.25,0.5,0.75,1 --iterations=2 --warmup=1
```

The accepted raw-byte two-scan path won across the measured densities without
increasing explicit temporary storage. The rejected alternatives were:

| candidate | representative memory | result |
| --- | ---: | --- |
| JavaScript single scan | 128 MiB | Rejected; maximum-size compact buffers over-allocated and did not win end to end. |
| WASM single/worker compaction | 397-512 MiB | Rejected; worker input/output materialization dominated. |
| Universal compact rectangle | No separate peak retained | Rejected; density results support sparse/dense routing rather than one representation for every commitment. |

All compared commitment outputs passed exact G1 parity. Production retains
active-rectangle discovery, raw zero scans, density routing, bounded dense
chunks, and sparse compaction only where the measured density justifies it.

## Small Binding Zero Compaction

Historical command:

```bash
npm run bench:binding-zero-compaction
```

| binding | inputs | current | compact | change | current temporary | compact temporary |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `O_pub_free` | 109 | 1.282 ms | 1.590 ms | +24.0% | 0.017 MiB | 0.015 MiB |

Exact G1 parity passed. The small memory reduction did not justify the fixed
scan and allocation cost, so `O_pub_free` keeps the non-compacted path.
Compaction for the larger `O_mid` and `O_prv` inputs was promoted separately.

## Degree Scans

Historical command:

```bash
npm run bench:degree-scans
```

The `4096x256` benchmark compared scalar ffjavascript zero tests with an aligned
raw-word scan:

| case | scalar | raw | speedup |
| --- | ---: | ---: | ---: |
| dense | 0.003 ms | 0.002 ms | 1.23x |
| trailing zero | 81.681 ms | 4.905 ms | 16.65x |
| sparse | 166.146 ms | 8.569 ms | 19.39x |
| all zero | 163.685 ms | 9.455 ms | 17.31x |

All degree pairs matched. The synthetic worst cases were not a measured
production hot path, while the dense representative cost was immaterial.
Adding another production path was therefore rejected. No memory result was
retained.

## Linear Combination Alternatives

Historical command:

```bash
npm run bench:prover-ops -- --groups=linear-combination --shapes=4x4,32x32,512x256,1024x256,4096x256 --iterations=1 --warmup=0
```

The non-unit two-pass add-scaled candidate allocated a temporary scaled source.
At `4096x256` it measured `400.489 ms`, compared with `369.712 ms` for the
existing path. Exact coefficient parity passed. It was rejected because the
extra pass and temporary buffer made the prover-scale case slower.

A separate custom worker add/sub/scale wrapper was also rejected as an
architecture. The accepted implementation uses backend-owned whole-chunk WASM
kernels through the existing ffjavascript thread manager; another worker layer
would duplicate scheduling and memory transfers. No independent timing or
memory result was retained for that unimplemented wrapper design.

## Coefficient-Oriented N-Term Combination

Historical command:

```bash
npm run bench:prover-ops -- --groups=linear-combination --shapes=4096x256,8192x512 --iterations=1 --warmup=0
```

| workload | shape | term-oriented | coefficient-oriented | regression |
| --- | --- | ---: | ---: | ---: |
| three full-shape terms | `4096x256` | 1041.922 ms | 1117.061 ms | 7.2% |
| two full plus prefix | `4096x256` | 744.508 ms | 991.750 ms | 33.2% |
| five full-shape terms | `4096x256` | 1425.707 ms | 1470.801 ms | 3.2% |
| three full-shape terms | `8192x512` | 4027.813 ms | 4357.717 ms | 8.2% |
| two full plus prefix | `8192x512` | 2865.006 ms | 3254.124 ms | 13.6% |
| five full-shape terms | `8192x512` | 5552.795 ms | 5662.926 ms | 2.0% |

Exact byte parity passed. Fewer output writes did not offset the
per-coefficient term loop, mixed-shape bounds checks, and scalar dispatch.
Production retains the term-oriented shape-aware accumulator. No separate
peak-memory result was retained.

## Generic Concurrent ROU Multiplication

Historical command:

```bash
npm run bench:prover-ops -- --shapes=1024x256 --groups=polynomial-mul --iterations=1 --warmup=0
```

The current bivariate path measured `6328.878 ms`; starting left and right ROU
conversions concurrently measured `6348.507 ms`. Exact polynomial parity
passed. The candidate was rejected because it did not improve the complete
boundary. No separate peak-memory result was retained.

## Evaluation Replacements

Historical command:

```bash
npm run bench:prover-ops -- --groups=evaluation --shapes=4096x256,8192x512 --iterations=1 --warmup=0
```

| candidate | `4096x256` | `8192x512` | result |
| --- | ---: | ---: | --- |
| current Horner | 335.025 ms | 1365.711 ms | baseline |
| raw-buffer Horner | 330.519 ms | 1607.586 ms | rejected; no representative gain |
| power table | 334.264 ms | 1598.930 ms | rejected; slower and adds temporary state |

Parity passed at small and representative shapes. Production retains the
current Horner implementation except for separately promoted call-site-specific
multi-point and adjusted-point formulas.

## Initialization Alternatives

Historical command:

```bash
npm run bench:prover-init
```

| candidate | total | result |
| --- | ---: | --- |
| production initialization | 15.99 s | baseline |
| direct sparse access | 16.15 s | rejected as a standalone change |
| row-major UVW writes | 16.06 s | rejected as a standalone change |
| independent ROU scheduling | 15.64 s | discarded by project-owner decision |

Parity passed. The isolated differences were small relative to run variance and
did not justify retaining a second initialization implementation. Later packed
CSR and direct-flat witness changes were promoted through focused benchmarks.
No representative peak-memory result was retained for the discarded scheduling
candidate.

## Segmented 2D NTT Alternatives

Historical command:

```bash
npm run bench:2d-ntt-micro-candidates
```

| shape | direction | current | G1 cache | G2 direct shards | G3 inverse output | G1+G2 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `4096x256` | forward | 354.750 ms | 361.876 ms | 323.244 ms | 356.194 ms | 327.755 ms |
| `4096x256` | inverse | 376.386 ms | 378.565 ms | 357.644 ms | 372.176 ms | 359.413 ms |
| `8192x512` | forward | 1392.968 ms | 1439.935 ms | 1272.758 ms | 1389.553 ms | 1277.666 ms |
| `8192x512` | inverse | 1481.382 ms | 1475.086 ms | 1381.312 ms | 1458.494 ms | 1353.727 ms |

All candidates passed forward, inverse, one-dimensional, true two-dimensional,
and coset parity. G1 regressed three of four cases. G3's complete-boundary
direction changed across repeated runs. G1+G2 was slower than G2 alone in three
of four cases. Only G2 direct task shards were promoted.

The accepted G2 allocation reduction was `128 -> 64 MiB` forward and
`192 -> 128 MiB` inverse at `4096x256`; rejected candidates did not provide a
better stable complete-boundary result.
