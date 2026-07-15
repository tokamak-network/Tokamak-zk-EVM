# MSM Benchmark

Audience: backend-wasm developers evaluating whether a G1 linear combination should use repeated scalar multiplication or the ffjavascript MSM path.

This directory contains a standalone benchmark for comparing four ways to compute a G1 inner product:

- sequential: repeated `G1.mulScalar()` followed by `G1.add()`.
- `msmAffine`: `G1.msmAffine()` with point and scalar arrays.
- `msmAffineRaw`: `G1.msmAffineRaw()` with runtime-ready byte buffers.
- `msmProjectiveRaw`: `ffjavascript` `G1.multiExp()` with runtime-ready projective/Jacobian point buffers.

The benchmark asserts that all methods return the same G1 point before it reports timing.

## Usage

```bash
npm run bench:msm -- --lengths=4,8,16,32 --iterations=10 --warmup=3
```

Useful options:

- `--lengths=4,8,16`: comma-separated vector lengths.
- `--iterations=10`: measured iterations per length.
- `--warmup=3`: warmup iterations per length.
- `--seed=0x544f4b414d414b`: deterministic pseudo-random seed.
- `--multi-thread`: use the runtime's multi-thread mode instead of single-thread mode.

## Latest Single-Thread Result

Command:

```bash
npm run bench:msm -- --lengths=4,8,16,32,64,128,256,512,1024,2048,4096,8192,16384,32768,65536 --iterations=1 --warmup=1
```

Environment: local Node.js run, backend-wasm single-thread curve runtime.

| length | sequential ms/op | msmAffine ms/op | msmAffineRaw ms/op | msmProjectiveRaw ms/op | best | affine raw speedup | projective raw speedup |
| ---: | ---: | ---: | ---: | ---: | :--- | ---: | ---: |
| 4 | 1.735 | 2.997 | 1.898 | 1.710 | msmProjectiveRaw | 0.91x | 1.01x |
| 8 | 3.538 | 3.323 | 2.977 | 2.763 | msmProjectiveRaw | 1.19x | 1.28x |
| 16 | 6.843 | 4.076 | 3.912 | 4.109 | msmAffineRaw | 1.75x | 1.67x |
| 32 | 13.661 | 6.134 | 6.051 | 6.096 | msmAffineRaw | 2.26x | 2.24x |
| 64 | 27.265 | 10.131 | 9.911 | 10.089 | msmAffineRaw | 2.75x | 2.70x |
| 128 | 55.151 | 16.664 | 16.736 | 16.677 | msmAffine | 3.30x | 3.31x |
| 256 | 109.872 | 27.841 | 27.870 | 28.643 | msmAffine | 3.94x | 3.84x |
| 512 | 218.491 | 48.181 | 47.189 | 47.222 | msmAffineRaw | 4.63x | 4.63x |
| 1024 | 458.793 | 83.520 | 87.474 | 89.349 | msmAffine | 5.24x | 5.13x |
| 2048 | 878.733 | 143.592 | 151.845 | 144.445 | msmAffine | 5.79x | 6.08x |
| 4096 | 1779.343 | 262.013 | 260.508 | 264.120 | msmAffineRaw | 6.83x | 6.74x |
| 8192 | 3547.007 | 465.636 | 464.609 | 469.549 | msmAffineRaw | 7.63x | 7.55x |
| 16384 | 7085.858 | 865.400 | 854.219 | 860.083 | msmAffineRaw | 8.30x | 8.24x |
| 32768 | 14212.916 | 1594.495 | 1589.499 | 1588.188 | msmProjectiveRaw | 8.94x | 8.95x |
| 65536 | 28335.231 | 2945.946 | 2913.222 | 2921.116 | msmAffineRaw | 9.73x | 9.70x |

Interpretation:

- For this run, MSM was at least competitive at length `4` and became clearly faster than sequential scalar multiplication from length `8`.
- The advantage of MSM increased with vector length, reaching about `9.7x` at length `65536`.
- `msmAffine`, `msmAffineRaw`, and `msmProjectiveRaw` were close across most lengths.
- Projective raw MSM won at lengths `4`, `8`, and `32768`, but the margin was small and not monotonic.
- This table does not justify a global switch to projective internal representation by itself. Use stage-specific verifier/prover timing before migrating production paths.

Timing is environment-dependent. Use these numbers as a local crossover snapshot, not as a permanent threshold.

## Prover MSM Layout Benchmark

Audience: backend-wasm developers evaluating whether prover commitments should keep snarkjs-style contiguous MSM inputs instead of rebuilding bases and scalars per commitment.

The prover layout benchmark compares two ways to feed the same `ffjavascript` `G1.multiExpAffine` primitive:

- current layout: scan a `BivariatePolynomialBuffer`, skip zero coefficients, copy matching `sigma1.xy-powers` entries from a `Uint8Array[]` CRS view, convert each scalar with `Fr.toRprLE`, then call MSM.
- snarkjs-style layout: keep the CRS affine point section as one contiguous buffer, batch-convert the contiguous coefficient buffer with `Fr.batchFromMontgomery`, then call MSM directly.

The benchmark asserts both layouts return the same G1 point before timing is reported.

Usage:

```bash
npm run bench:prover-msm-layout -- --lengths=1024,4096,16384 --iterations=3 --warmup=1
```

Useful options:

- `--lengths=1024,4096`: comma-separated even vector lengths.
- `--iterations=3`: measured iterations per length.
- `--warmup=1`: warmup iterations per length.
- `--seed=0x544f4b414d414b`: deterministic pseudo-random scalar seed.
- `--multi-thread`: use the runtime's multi-thread mode instead of single-thread mode.
- `--json=tmp/timing/prover-msm-layout.json`: write a JSON report to an ignored diagnostics path.

### Latest Single-Thread Layout Result

Command:

```bash
npm run bench:prover-msm-layout -- --lengths=1024,4096,16384,65536 --iterations=2 --warmup=1 --json=tmp/timing/prover-msm-layout.json
```

Environment: local Node.js run, backend-wasm single-thread curve runtime.

| length | current prep ms | current msm ms | current total ms | snarkjs prep ms | snarkjs msm ms | snarkjs total ms | total speedup |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1024 | 0.409 | 75.762 | 75.649 | 0.052 | 75.277 | 74.636 | 1.01x |
| 4096 | 2.029 | 235.066 | 236.883 | 0.185 | 235.299 | 235.436 | 1.01x |
| 16384 | 4.820 | 773.260 | 774.588 | 0.661 | 773.609 | 772.189 | 1.00x |
| 65536 | 20.153 | 2612.136 | 2644.608 | 2.819 | 2610.797 | 2618.557 | 1.01x |

Interpretation:

- The snarkjs-style path made scalar preparation much cheaper by using one contiguous `Fr.batchFromMontgomery` call instead of per-coefficient scalar conversion.
- Total runtime changed by only about `1%` in this benchmark because `G1.multiExpAffine` dominates the measured cost at these lengths.
- This result means the current prover slowdown cannot be explained by CRS/scalar buffer preparation alone. The next optimization target remains reducing the number, size, or scheduling cost of large MSM calls, and checking whether the curve runtime should use ffjavascript's threaded path for prover diagnostics.

## Independent MSM Parallel Benchmark

Audience: backend-wasm developers evaluating independent prover commitment parallelism before changing runtime prover code.

This benchmark compares three execution shapes for unrelated G1 MSM jobs:

- sequential: run each MSM one after another on one backend-wasm curve runtime.
- same runtime `Promise.all`: submit unrelated MSM calls concurrently to the same curve runtime.
- process per job: preload each independent MSM job into a dedicated Node.js child process and run the jobs concurrently with one backend-wasm curve runtime per process.

The process-per-job mode is an upper-bound experiment for compute parallelism. It does not include production data-transfer design, worker pooling policy, or browser worker lifecycle costs. Node child processes are used here because importing ffjavascript inside a generic Node worker thread conflicts with ffjavascript's own worker bootstrap path.

Usage:

```bash
npm run bench:msm:parallel -- --lengths=16384,16384,16384,32768,16384,16384 --iterations=2 --warmup=1
```

Useful options:

- `--lengths=16384,32768`: comma-separated point counts, one MSM job per entry.
- `--iterations=2`: measured iterations.
- `--warmup=1`: warmup iterations.
- `--seed=0x544f4b414d414b`: deterministic pseudo-random scalar seed.
- `--multi-thread`: use ffjavascript multi-thread curve instances instead of single-thread instances.
- `--json=tmp/timing/independent-msm-parallel.json`: write a JSON report to an ignored diagnostics path.

### Latest Single-Thread Parallel Result

Command:

```bash
npm run bench:msm:parallel -- --lengths=16384,16384,16384,32768,16384,16384 --iterations=2 --warmup=1 --json=tmp/timing/independent-msm-parallel.json
```

Environment: local Node.js run, backend-wasm single-thread curve runtime per process.

| jobs | total points | max job points | sequential ms | same runtime Promise.all ms | process/job ms | same runtime speedup | process speedup |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 6 | 114688 | 32768 | 5258.547 | 5273.951 | 1503.631 | 1.00x | 3.50x |

Interpretation:

- Submitting unrelated MSMs through `Promise.all` on the same runtime did not improve wall time.
- Running unrelated MSMs concurrently through separate pre-initialized processes and separate curve runtimes improved wall time by `3.50x` for this workload.
- This supports experimenting with a real prover-side worker pool for independent commitment MSMs, but the production design must still measure browser worker startup, data transfer, memory pressure, and result ordering.
