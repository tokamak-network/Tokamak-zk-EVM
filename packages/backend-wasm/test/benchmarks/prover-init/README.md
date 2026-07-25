# Prover Init Benchmark

Audience: backend-wasm developers isolating and optimizing prover initialization before changing production prover code.

This benchmark is diagnostics-only. It is not imported by `src/`, is not part of package distribution, and writes latest reports under ignored `tmp/timing/`.

The benchmark covers the initialization path that turns already-loaded prover runtime inputs into internal prover state:

- witness polynomial construction
- prover instance polynomial construction
- permutation polynomial construction
- vanishing polynomial construction
- prover mixer allocation

The benchmark first runs the production initialization path, then runs the phase-instrumented diagnostics path and compares the produced witness and instance polynomial buffers byte-for-byte. Mixer values are random by design, so the diagnostics path checks mixer shape instead of scalar equality.

## Usage

```bash
npm run bench:prover-init
```

Useful options:

- `--runtime-dir=fixtures/small/runtime`: prepared runtime fixture directory.
- `--json=tmp/timing/prover-init-benchmark.json`: structured report path.
- `--markdown=tmp/timing/prover-init-benchmark.md`: human-readable report path.

The sparse witness accumulation benchmark has a separate entry point:

```bash
npm run bench:prover-init:sparse
```

It compares the current per-entry JavaScript field loop with a packed CSR row-dot
kernel in caller-thread WASM, one ffjavascript worker, and row-sharded workers.
Its measured accumulation boundary includes active-wire and CSR packing, worker
input transfer, kernel execution, result transfer, and output assembly.

## Promotion Rule

Do not promote an init optimization candidate into production code from this benchmark alone. A production change must also pass full prover acceptance, generated-proof verification, and package distribution checks.

## Initial Candidate Run

Command:

```bash
npm run bench:prover-init
```

Fixture: `fixtures/small/runtime`.

| candidate | total | result |
| --- | ---: | --- |
| production init | 15.99 s | reference runtime path |
| baseline profiled init | 16.72 s | parity passed |
| flat-buffer candidate | 15.79 s | parity passed; small positive signal |
| direct-sparse candidate | 16.15 s | parity passed; not a clear improvement |
| row-major UVW candidate | 16.06 s | parity passed; not a clear improvement |
| parallel ROU candidate | 15.64 s | parity passed; best diagnostic result; discarded |

Interpretation:

- The dominant baseline phases are ROU-to-coefficient conversion: `uvw.from_rou_evals` about `7.96 s`, `permutation.from_rou_evals` about `4.98 s`, and `bXY.from_rou_evals` about `2.55 s`.
- Allocation, validation, sparse R1CS indexing, vanishing polynomial construction, and mixer construction are not current init bottlenecks.
- Flat buffers help allocation and materialization, but the observed win is small and noisy.
- Direct sparse active-wire access and row-major UVW writes are not sufficient standalone production candidates.
- Parallel scheduling of independent ROU conversions was the strongest candidate in this diagnostic run, but the project owner discarded its production promotion. Retain this result only as historical benchmark evidence.

## Sparse Witness Accumulation

Fixture: `fixtures/small/runtime`. Worker count: `14`.

| candidate | sparse accumulation | complete witness | parity |
| --- | ---: | ---: | --- |
| current per-entry JavaScript | 822.279 ms | 2.76 s | exact |
| caller-thread WASM | 323.193 ms | 2.27 s | exact |
| one ffjavascript worker | 328.331 ms | 2.16 s | exact |
| 14 row-sharded workers | 529.133 ms | 2.55 s | exact |

All candidates preserve entry order within each row and produce byte-identical
`b`, `u`, `v`, `w`, and `r` witness polynomials. The packed WASM kernel is
effective, but row sharding is not: these sparse matrices do not provide enough
work per task to amortize repeated packing and worker transfer. Production
promotion should therefore use one worker task per matrix rather than row
sharding.

## Persistent Packed CSR

`bench-packed-r1cs.ts` isolates the repeated CSR construction that remains
around the accepted sparse row-dot kernel. It compares rebuilding
`rowOffsets`, `columns`, and coefficient bytes for every placement/matrix with
one immutable packed representation reused by all 234 placements.

The benchmark checks exact U/V/W row-evaluation bytes and final U/V/W
polynomial coefficient bytes. Three measured iterations produced:

| candidate | median | min | max | repeated pack | sparse dot | packed bytes constructed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| current repack per placement | 381.097 ms | 380.046 ms | 384.491 ms | 45.721 ms | 232.614 ms | 95.961 MiB |
| cached packed CSR | 329.357 ms | 323.437 ms | 330.283 ms | none | 228.378 ms | 3.459 MiB |

Constructing the 42 cached matrices once took `6.892 ms`. Including that
one-time diagnostic construction still leaves the candidate faster; a
production generated representation would bake these buffers at build time.
The runtime boundary improved by `51.740 ms` (`13.6%`) and avoided
approximately `92.5 MiB` of repeated packed-data construction. The current
generated module still contains `172,032` row arrays and `81,624` entry
objects, so removing generated object expansion remains part of the separate
production plan rather than this diagnostics change.

## Flat Witness Construction

`bench-flat-witness.ts` compares the current witness materialization boundary
with direct final-buffer construction. All candidates use the same
`sparseRowDotBuffer(...)` primitive and include `bXY`, `uXY`, `vXY`, and `wXY`
ROU-to-coefficient conversion.

- `current-object-transpose` reproduces field-element arrays, placement-major
  U/V/W outputs, object-array transpose, concatenation, and polynomial
  materialization.
- `flat-direct-output` keeps the current per-placement CSR reconstruction but
  writes B and U/V/W directly into final row-major byte buffers.
- `packed-flat-combined` combines the independently measured persistent packed
  CSR candidate with direct final buffers.

```bash
npm run bench:flat-witness
```

Environment: local Node.js with exposed GC, one warmup, three alternating-order
measured iterations, and the prepared small runtime fixture.

| candidate | median ms | allocation ms | fill ms | transpose ms | materialization ms | JS array entries | explicit copied MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current object/transpose | 4143.801 | 91.391 | 531.080 | 18.479 | 3502.613 | 7,340,032 | 224.000 |
| flat direct output | 2923.687 | 1.243 | 399.700 | 0 | 2522.568 | 0 | 87.750 |
| packed CSR + flat output | 2781.108 | 1.102 | 358.354 | 0 | 2421.392 | 0 | 87.750 |

The standalone flat candidate reduced the measured boundary by `1220.114 ms`
(`29.4%`). The combined candidate reduced it by `1362.693 ms` (`32.9%`);
this combined number is measured directly and is not the sum of isolated
speedups. Exact coefficient parity passed for all four polynomials on both the
prepared fixture and a deterministic small layout containing empty rows and
unused placement columns.

The benchmark samples process-relative heap and RSS at phase boundaries.
The current path's median run reached a `761.014 MiB` heap delta, while the flat
path reached `9.977 MiB`; this supports the explicit array-allocation result.
RSS deltas are retained in the JSON report but are not used as an absolute peak
comparison because the allocator reuses memory between candidates in the same
process. The exact JavaScript entry and explicit-copy counts are the
authoritative allocation metrics for promotion review.
