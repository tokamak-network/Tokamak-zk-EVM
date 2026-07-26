# Worker Parallelization Report

Audience: backend-wasm developers reviewing historical prover MSM parallelization work before changing prover scheduling or runtime curve configuration.

## Summary

The backend-wasm worker-parallelized prover commitment plan was investigated because large independent MSM jobs dominated the early prover timing data. The experiments showed that browser Web Workers can parallelize independent MSM jobs, but the production plan was discarded after the codebase switched to using ffjavascript primitive parallelism directly through `createCurveRuntime()` with `singleThread: false` by default.

The executable worker experiments are scheduled for removal now that their
durable evidence is preserved in this report. The commands below are historical
invocation records and will no longer exist in `package.json` after that
cleanup. The current production prover path does not expose or inject a browser
worker commitment encoder.

## Motivation

The initial prover implementation was correct but far too slow for practical browser proving. Timing records showed that commitment MSM work was a major share of the wall time:

- `encode.msm` total in the Node stage-timing diagnostic: about `699.60 s`.
- Largest measured MSM labels included `Q_CX`, `Pi_CX`, `Pi_AX`, `Q_CY`, and `Q_AX`.
- Independent commitment outputs existed inside transcript dependency barriers, so they looked like natural candidates for parallel execution.

The main question was whether independent MSM jobs could be distributed across multiple browser workers so the prover could use more CPU cores without changing proof bytes, transcript order, or binary artifact formats.

## Background

ffjavascript already contains internal worker-capable primitives. MSM, FFT, and related operations are implemented around a curve runtime and its thread manager. backend-wasm wraps this runtime through `createCurveRuntime(...)`.

The production branch that currently matches `bench/ffjs-primitive-parallel` changed the runtime default to:

```ts
const singleThread = options.singleThread ?? false;
```

That means normal production callers use ffjavascript's primitive-level parallel mode unless they explicitly request `singleThread: true`.

The discarded worker plan was a different layer of parallelism:

- keep each worker-local backend-wasm curve runtime in `singleThread: true`;
- create a browser `Worker` pool in backend-wasm;
- split independent commitment MSM jobs, or CRS row-band partial MSM jobs, across those workers;
- return partial G1 results to the main thread and reduce them there.

That outer worker plan competed with ffjavascript's own primitive-level parallelism and had higher implementation and memory complexity.

## Attempts

### Independent MSM Parallelism In Node.js

The first experiment compared three execution modes for unrelated MSM jobs:

- sequential execution on one curve runtime;
- `Promise.all` on one curve runtime;
- one Node.js child process per MSM job, with one curve runtime per process.

Recorded command:

```bash
npm run bench:msm:parallel -- --lengths=16384,16384,16384,32768,16384,16384 --iterations=2 --warmup=1 --json=tmp/timing/independent-msm-parallel.json
```

Recorded result:

| jobs | total points | max job points | sequential ms | same runtime Promise.all ms | process/job ms | same runtime speedup | process speedup |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 6 | 114688 | 32768 | 5258.547 | 5273.951 | 1503.631 | 1.00x | 3.50x |

Conclusion:

- `Promise.all` on one runtime was not useful.
- Separate execution contexts produced real parallel speedup.
- This justified a browser worker experiment, but did not solve browser data transfer, worker lifecycle, or memory amplification.

### Browser Worker Pool With Synthetic MSM Inputs

The second experiment moved the independent-MSM workload into Chromium. Each Web Worker owned its own backend-wasm curve runtime and received preloaded MSM input buffers.

Recorded command:

```bash
npm run bench:msm:browser-workers -- --lengths=16384,16384,16384,32768,16384,16384 --iterations=2 --warmup=1 --workers=6 --timeout-ms=240000 --json=tmp/timing/browser-msm-worker-pool.json
```

Recorded environment:

- Chromium through Playwright.
- One backend-wasm single-thread curve runtime per worker.
- `hardwareConcurrency=14`.

Recorded result:

| jobs | total points | max job points | assignment points | transferred MiB | preload ms | sequential ms | worker pool ms | speedup |
| ---: | ---: | ---: | :--- | ---: | ---: | ---: | ---: | ---: |
| 6 | 114688 | 32768 | 32768,16384,16384,16384,16384,16384 | 14.000 | 127.040 | 5329.970 | 1511.740 | 3.53x |

Conclusion:

- Browser workers preserved the synthetic independent-MSM speedup.
- Worker startup and preload were measurable but not dominant for this synthetic workload.
- The result was still insufficient for production because synthetic inputs did not model real CRS loading, CRS sharing, partial MSM reduction, or WebAssembly memory copies.

### Browser CRS-Sharded Partial MSM

The next experiment used the real `sigma1.xy-powers` CRS section from a prepared prover CRS binary. It compared:

- `shared`: one JavaScript `SharedArrayBuffer` containing the source CRS bytes, with workers reading row-band offsets;
- `transfer`: transferable row-band CRS shards copied to workers.

Recorded command:

```bash
npm run bench:msm:browser-crs-shards -- --rows=8192 --cols=511 --stride=512 --workers=6 --modes=shared,transfer --chunk-points=16384 --layout=auto --iterations=1 --warmup=0 --timeout-ms=1800000 --json=tmp/timing/browser-crs-sharded-msm-full.json
```

Recorded environment:

- Chromium through Playwright.
- Real prepared `sigma1.xy-powers` CRS bytes served from `fixtures/small/runtime/prover-crs-prepared-data/crs.bin`.
- `crossOriginIsolated=true`.

Recorded result:

| mode | workers | shard rows | layout | chunk points | chunks | points | active points | loaded xy-powers MiB | JS shared source CRS MiB | transferred CRS MiB | scalar MiB | WASM zero-copy | preload ms | msm ms |
| :--- | ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: | ---: |
| shared | 6 | 1366,1366,1365,1365,1365,1365 | stride | 16384 | 258 | 4194304 | 4186112 | 384.000 | 384.000 | 0.000 | 128.000 | no | 205.375 | 51759.030 |
| transfer | 6 | 1366,1366,1365,1365,1365,1365 | stride | 16384 | 258 | 4194304 | 4186112 | 384.000 | 0.000 | 384.000 | 128.000 | no | 192.995 | 51938.500 |

Conclusion:

- CRS-sharded browser worker MSM was executable at the full current `8192x511` shape.
- `SharedArrayBuffer` avoided JavaScript-level CRS row-band transfer into each worker.
- Transfer mode copied only the row-band shards, not the full CRS per worker.
- The path was not WebAssembly zero-copy. ffjavascript still sliced typed arrays and copied chunks into WebAssembly linear memory before MSM execution.
- This left significant memory and implementation complexity in any production worker scheduler.

### Worker-Backed Integrated Prover Timing

A production-style worker encoder was then wired into the integrated prover on the experimental branch. It used the worker-backed commitment encoder and verified the generated proof through the prepared verifier runtime path.

Recorded result:

- load prover input: `1.99 s`;
- worker-backed `proveSnark`: `1058.02 s`;
- verifier check: `47 ms`;
- total browser run: `1060.17 s`;
- proof size: `2408` bytes.

Recorded commitment-barrier timing:

- first proof barrier `[U, V, W, Q_AX, Q_AY, B]`: `93.16 s` for `7,371,279` compact points;
- `R`: `13.27 s` for `1,052,929` compact points;
- copy quotient barrier `[Q_CX, Q_CY]`: `76.36 s` for `6,291,199` compact points;
- final opening barrier `[Pi_AX, Pi_AY, M_X, M_Y, N_X, N_Y, Pi_CX, Pi_CY, Pi_B]`: `153.02 s` for `8,378,490` compact points.

Conclusion:

- Worker-backed MSM produced a verifier-accepted proof.
- It did not make the prover practical by itself.
- Commitment barriers still consumed about `335.8 s`.
- Non-commitment prover work still consumed about `722.2 s`.
- The next optimization target had to include polynomial buffers, NTT/ROU conversion, multiplication, linear combinations, and scalar/base preparation, not just MSM worker scheduling.

## Why The Plan Was Discarded

The worker-parallelized production prover plan was discarded for the current codebase for these reasons:

1. ffjavascript primitive parallelism is already available.
   The current runtime default is `singleThread: false`, so production code can use ffjavascript's internal primitive parallelism without adding a backend-wasm worker scheduler.

2. Outer worker scheduling competed with primitive-level parallelism.
   A backend-wasm worker pool with worker-local `singleThread: true` runtimes was a separate parallelism layer. Keeping both layers would risk oversubscription, duplicated WASM memories, and harder peak-memory control.

3. The worker plan introduced production API and architecture complexity.
   It required a public or injectable commitment encoder, browser worker entrypoints, worker lifecycle management, CRS sharding policy, partial MSM reduction, transcript-barrier scheduling, and browser deployment requirements such as cross-origin isolation.

4. It did not solve the remaining prover bottleneck.
   The integrated worker run still spent about `722.2 s` outside commitment barriers. That made worker MSM scheduling an incomplete optimization.

5. CRS sharing was not WASM zero-copy.
   `SharedArrayBuffer` helped at the JavaScript worker boundary, but ffjavascript still copied MSM chunks into WebAssembly memory. This reduced the expected memory benefit of the worker design.

6. The current branch intentionally uses primitive API parallelism instead.
   The production code no longer contains the browser worker commitment encoder. The runtime path is simpler: create a curve runtime with ffjavascript primitive parallelism enabled and keep worker experiments outside production code.

## Current Status

Production runtime status:

- `src/prover` does not contain the browser worker commitment encoder.
- `proveSnark(...)` does not accept a worker commitment encoder option.
- `src/prover`, `src/core`, and package entrypoints do not create browser workers.
- `createCurveRuntime()` defaults to ffjavascript primitive parallel mode through `singleThread: false`.

Benchmark status:

- The independent-process, browser worker-pool, and browser CRS-sharding
  executable experiments are deprecated and scheduled for deletion.
- Their representative commands, environments, timing, memory-transfer data,
  parity result, and rejection rationale are preserved above.
- Reconsideration requires a new benchmark designed against the current
  primitive-parallel production path; this report is not an active production
  worker plan.

## Lessons For Future Optimization

- Do not use `Promise.all` on one curve runtime as evidence of real parallelism.
- If backend-wasm workers are reconsidered, compare them against ffjavascript primitive parallelism first, using the same prover fixture and the same timing categories.
- Measure full end-to-end prover time, not only isolated MSM speedup.
- Report JavaScript transfer bytes, declared CRS/scalar bytes, worker preload, WebAssembly copy behavior, and browser deployment requirements.
- Do not restore worker experiments to production or retained benchmark suites
  unless a new proposal first outperforms the primitive-parallel production path
  end to end and justifies the added runtime and deployment complexity.
