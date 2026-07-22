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
| parallel ROU candidate | 15.64 s | parity passed; best diagnostic result |

Interpretation:

- The dominant baseline phases are ROU-to-coefficient conversion: `uvw.from_rou_evals` about `7.96 s`, `permutation.from_rou_evals` about `4.98 s`, and `bXY.from_rou_evals` about `2.55 s`.
- Allocation, validation, sparse R1CS indexing, vanishing polynomial construction, and mixer construction are not current init bottlenecks.
- Flat buffers help allocation and materialization, but the observed win is small and noisy.
- Direct sparse active-wire access and row-major UVW writes are not sufficient standalone production candidates.
- Parallel scheduling of independent ROU conversions is the strongest candidate from this run, but it has not been promoted to production. A production change requires separate approval and full acceptance checks.
