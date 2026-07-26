# Deprecated Parallel Worker Wrapper Benchmarks

Audience: backend-wasm developers inspecting the discarded outer-worker MSM parallelization experiments.

This directory contains the deprecated worker-wrapper benchmark code that used to live directly under `test/benchmarks/msm/`. The durable report is retained under `docs/optimization`. The active production prover direction is ffjavascript primitive parallelism through `createCurveRuntime()` with `singleThread: false`, not backend-wasm-managed worker commitment scheduling.

## Files

- `bench-independent-msm-parallel.ts`: Node.js sequential, same-runtime `Promise.all`, and process-per-job MSM comparison.
- `bench-browser-msm-worker-pool.ts`: Chromium Web Worker pool benchmark with synthetic MSM inputs.
- `browser-msm-worker-entry.ts`: browser main-thread entry for the synthetic worker-pool benchmark.
- `browser-msm-worker.ts`: browser worker implementation for the synthetic worker-pool benchmark.
- `bench-browser-crs-sharded-msm.ts`: Chromium CRS-sharded partial-MSM benchmark with real prepared CRS bytes.
- `browser-crs-sharded-msm-entry.ts`: browser main-thread entry for the CRS-sharded benchmark.
- `browser-crs-sharded-msm-worker.ts`: browser worker implementation for the CRS-sharded benchmark.
- [`docs/optimization/rejected/outer-worker-msm.md`](../../../../../docs/optimization/rejected/outer-worker-msm.md): historical report explaining the motivation, attempts, results, and reason for discarding the production worker-wrapper plan.

## Commands

The package-level scripts still point to these deprecated files so old measurements can be reproduced deliberately:

```bash
npm run bench:msm:parallel
npm run bench:msm:browser-workers
npm run bench:msm:browser-crs-shards
```

These commands are diagnostic only. Do not treat them as production prover runtime coverage.
