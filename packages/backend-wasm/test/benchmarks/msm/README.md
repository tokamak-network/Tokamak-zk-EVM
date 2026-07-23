# MSM Benchmark

Audience: backend-wasm developers evaluating whether a G1 linear combination should use repeated scalar multiplication or the ffjavascript MSM path.

This directory contains a standalone benchmark for comparing four ways to compute a G1 inner product:

- sequential: repeated `G1.mulScalar()` followed by `G1.add()`.
- `msmAffine`: `G1.msmAffine()` with point and scalar arrays.
- `msmAffineRaw`: `G1.msmAffineRaw()` with runtime-ready byte buffers.
- `msmProjectiveRaw`: `ffjavascript` `G1.multiExp()` with runtime-ready projective/Jacobian point buffers.

The benchmark asserts that all methods return the same G1 point before it reports timing.

Historical note: [deprecated/parallel-worker-wrapper/worker-parallelization-report.md](./deprecated/parallel-worker-wrapper/worker-parallelization-report.md) records the discarded browser worker MSM parallelization plan, the measurements that motivated it, and why the current production path uses ffjavascript primitive parallelism instead.

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

## Primitive MSM Parallelism Check

Audience: backend-wasm developers verifying that ffjavascript primitive-level MSM parallelism is active and consistent with prover commitment timing.

`bench:msm:primitive` calls the ffjavascript primitive `G1.multiExpAffine(...)` directly in both curve modes:

- single-thread mode: `getCurveFromName("bls12381", true)`.
- multi-thread mode: `getCurveFromName("bls12381", false)`.

The benchmark builds deterministic affine G1 bases and raw little-endian scalar buffers, runs one MSM per mode, and asserts that the two outputs are equal before reporting timing.

Command:

```bash
npm run bench:msm:primitive -- --length=1048576 --iterations=1 --warmup=0 --json=tmp/timing/primitive-msm-2pow20.json
```

Environment: local Node.js run, direct ffjavascript primitive API.

| mode | length | base generation ms | scalar generation ms | multiExpAffine ms/op |
| :--- | ---: | ---: | ---: | ---: |
| single-thread | 1048576 | 25338.854 | 1298.138 | 30641.016 |
| multi-thread | 1048576 | 25989.511 | 1374.119 | 4890.646 |

Result: multi-thread primitive MSM was `6.27x` faster than single-thread primitive MSM at length `2^20`, and the output equality check passed.

Production encode consistency check:

- The current prover dense Sigma1 commitment path chunks dense MSM input at `262144` points.
- The direct primitive benchmark at that production chunk size measured single-thread `8830.436 ms/op`, multi-thread `1243.881 ms/op`, and `7.10x` speedup.
- The latest prover timing table reports `polynomial.encode = 117.479 s`, `binding.encode = 1.992 s`, and total `encode = 119.471 s` across 19 encode events.
- This is consistent with production encode using ffjavascript primitive-level parallel MSM: a single-thread encode path would be expected to be several times slower for MSM-dominated commitment events. The total encode time is not expected to equal one `2^20` MSM because production encode consists of many commitment events, dense `2^18` chunks, sparse commitments, scalar conversion, CRS slicing, and G1 partial-result accumulation.

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

The prover layout benchmark compares three ways to feed the same `ffjavascript` `G1.multiExpAffine` primitive:

- current layout: scan a `BivariatePolynomialBuffer`, skip zero coefficients, copy matching `sigma1.xy-powers` entries from a `Uint8Array[]` CRS view, convert each scalar with `Fr.toRprLE`, then call MSM.
- raw-slice sparse layout: keep the current sparse extraction strategy, but copy bases from the contiguous `sigma1.xy-powers` raw section instead of the split point array.
- snarkjs-style layout: keep the CRS affine point section as one contiguous buffer, batch-convert the contiguous coefficient buffer with `Fr.batchFromMontgomery`, then call MSM directly.

The benchmark asserts all layouts return the same G1 point before timing is reported.

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
npm run bench:prover-msm-layout -- --lengths=1024,4096,16384 --iterations=2 --warmup=1 --json=tmp/timing/prover-msm-layout-raw-slice.json
```

Environment: local Node.js run, backend-wasm single-thread curve runtime.

| length | current prep ms | current msm ms | current total ms | raw-slice prep ms | raw-slice msm ms | raw-slice total ms | raw-slice speedup | snarkjs prep ms | snarkjs msm ms | snarkjs total ms | snarkjs speedup |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1024 | 0.447 | 73.203 | 73.675 | 0.468 | 72.811 | 73.121 | 1.01x | 0.048 | 72.966 | 73.084 | 1.01x |
| 4096 | 1.455 | 228.859 | 229.711 | 1.580 | 228.783 | 231.491 | 0.99x | 0.144 | 230.364 | 231.772 | 0.99x |
| 16384 | 4.677 | 753.399 | 759.469 | 5.213 | 758.583 | 762.127 | 1.00x | 0.655 | 754.782 | 756.114 | 1.00x |

Interpretation:

- The raw-slice sparse path does not materially improve total runtime over the current split-point sparse path. It is not worth promoting to production by itself.
- The snarkjs-style path still makes scalar preparation much cheaper by using one contiguous `Fr.batchFromMontgomery` call instead of per-coefficient scalar conversion, but total runtime remains effectively unchanged because `G1.multiExpAffine` dominates the measured cost.
- This result means the current prover slowdown cannot be explained by CRS/scalar buffer preparation alone. The next optimization target remains reducing polynomial-operation cost and the number or size of large MSM calls, rather than only changing base-copy layout.

## Deprecated Worker Wrapper Benchmarks

The independent MSM process benchmark, browser worker-pool benchmark, browser CRS-sharded worker benchmark, and worker parallelization report have moved to [deprecated/parallel-worker-wrapper](./deprecated/parallel-worker-wrapper/).

These files are retained only as historical diagnostics for the discarded backend-wasm worker-wrapper plan. Current production prover code uses ffjavascript primitive parallelism instead of backend-wasm-managed worker commitment scheduling.

## Commitment Density Benchmark

Audience: backend-wasm developers deciding whether prover commitments should use sparse nonzero extraction or compact rectangular MSM input construction.

This benchmark compares two commitment input layouts for a synthetic one-row polynomial:

- sparse: scan coefficients, skip zeros, copy only matching bases and nonzero scalars, then call `G1.msmAffineRaw()`.
- compact: keep the full base buffer, batch-convert the full coefficient buffer with `Fr.batchFromMontgomeryBuffer()`, then call `G1.msmAffineRaw()` with zero scalars included.

Usage:

```bash
npm run bench:commitment-density -- --lengths=1024,4096,16384 --densities=0.1,0.25,0.5,0.75,1 --iterations=1 --warmup=0
```

Useful options:

- `--lengths=1024,4096`: comma-separated vector lengths.
- `--densities=0.1,0.5,1`: comma-separated nonzero coefficient probabilities.
- `--iterations=1`: measured iterations.
- `--warmup=0`: warmup iterations.
- `--seed=0x544f4b414d414b`: deterministic pseudo-random scalar seed.
- `--json=tmp/timing/commitment-density.json`: write a JSON report to an ignored diagnostics path.

### Latest Density Result

Command:

```bash
npm run bench:commitment-density -- --lengths=1024,4096,16384 --densities=0.1,0.25,0.5,0.75,1 --iterations=1 --warmup=0 --json=tmp/timing/commitment-density.json
```

Environment: local Node.js run, backend-wasm single-thread curve runtime.

| length | density | nonzero | sparse total ms | compact total ms | compact speedup |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1024 | 0.10 | 102 | 13.008 | 14.593 | 0.89x |
| 1024 | 0.25 | 250 | 25.662 | 26.304 | 0.98x |
| 1024 | 0.50 | 532 | 44.478 | 45.606 | 0.98x |
| 1024 | 0.75 | 763 | 59.080 | 59.012 | 1.00x |
| 1024 | 1.00 | 1024 | 76.709 | 75.922 | 1.01x |
| 4096 | 0.10 | 416 | 36.915 | 44.302 | 0.83x |
| 4096 | 0.25 | 1053 | 77.123 | 83.486 | 0.92x |
| 4096 | 0.50 | 2059 | 134.404 | 144.117 | 0.93x |
| 4096 | 0.75 | 3050 | 188.394 | 186.121 | 1.01x |
| 4096 | 1.00 | 4096 | 246.818 | 237.663 | 1.04x |
| 16384 | 0.10 | 1650 | 116.186 | 143.345 | 0.81x |
| 16384 | 0.25 | 4046 | 243.455 | 268.565 | 0.91x |
| 16384 | 0.50 | 8140 | 438.801 | 448.858 | 0.98x |
| 16384 | 0.75 | 12239 | 609.762 | 617.992 | 0.99x |
| 16384 | 1.00 | 16384 | 783.659 | 783.247 | 1.00x |

Interpretation:

- Compact rectangular input construction is not a safe global replacement for sparse extraction.
- Compact only becomes competitive near fully dense inputs, and the measured win is small or inconsistent.
- Production commitment optimization should focus on real raw-buffer reuse, reducing the number of MSMs, or worker scheduling rather than replacing every commitment with compact rectangular input.
