# MSM Benchmark

Audience: backend-wasm developers evaluating whether a G1 linear combination should use repeated scalar multiplication or the ffjavascript MSM path.

This directory contains a standalone benchmark for comparing three ways to compute a G1 inner product:

- sequential: repeated `G1.mulScalar()` followed by `G1.add()`.
- `msmAffine`: `G1.msmAffine()` with point and scalar arrays.
- `msmAffineRaw`: `G1.msmAffineRaw()` with runtime-ready byte buffers.

The benchmark asserts that all three methods return the same G1 point before it reports timing.

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

| length | sequential ms/op | msmAffine ms/op | msmAffineRaw ms/op | best | raw speedup |
| ---: | ---: | ---: | ---: | :--- | ---: |
| 4 | 1.833 | 2.333 | 1.940 | sequential | 0.94x |
| 8 | 3.403 | 2.792 | 2.647 | msmAffineRaw | 1.29x |
| 16 | 7.005 | 4.253 | 4.115 | msmAffineRaw | 1.70x |
| 32 | 13.804 | 6.094 | 6.102 | msmAffine | 2.26x |
| 64 | 28.502 | 10.298 | 10.346 | msmAffine | 2.75x |
| 128 | 55.461 | 16.914 | 16.783 | msmAffineRaw | 3.30x |
| 256 | 112.037 | 28.481 | 28.344 | msmAffineRaw | 3.95x |
| 512 | 220.357 | 47.712 | 47.479 | msmAffineRaw | 4.64x |
| 1024 | 446.110 | 85.734 | 85.552 | msmAffineRaw | 5.21x |
| 2048 | 889.056 | 149.454 | 146.344 | msmAffineRaw | 6.08x |
| 4096 | 1784.860 | 263.249 | 265.482 | msmAffine | 6.72x |
| 8192 | 3585.457 | 470.385 | 477.631 | msmAffine | 7.51x |
| 16384 | 7122.985 | 859.496 | 863.269 | msmAffine | 8.25x |
| 32768 | 14559.438 | 1588.864 | 1613.796 | msmAffine | 9.02x |
| 65536 | 28587.259 | 2973.003 | 2964.848 | msmAffineRaw | 9.64x |

Interpretation:

- For this run, sequential scalar multiplication was best only at length `4`.
- MSM became faster at length `8`.
- The advantage of MSM increased with vector length, reaching about `9.6x` at length `65536`.
- `msmAffine` and `msmAffineRaw` are close; `msmAffineRaw` is preferable when the caller already has runtime-ready contiguous buffers.

Timing is environment-dependent. Use these numbers as a local crossover snapshot, not as a permanent threshold.
