# Prover Operation Benchmark Matrix

Audience: backend-wasm developers selecting measured prover hot-path optimizations before changing production prover code.

This benchmark is diagnostics-only. It is not imported by `src/`, is not part of package distribution, and writes structured reports under ignored `tmp/timing/`.

The matrix covers the five optimization candidate groups currently required by `tmp/planning.md`:

- `2d-ntt`: current 2D ROU conversion, direct `biNttBuffer`, and transpose overhead for future contiguous row/column candidates.
- `field-vector-mul`: allocation-heavy split/map/concat multiplication versus a tight indexed buffer loop.
- `linear-combination`: current `linearCombinationBuffer` versus a same-shape preallocated accumulator.
- `division`: current Ruffini opening division and native-style vanishing quotient recurrence with reconstruction checks.
- `materialization`: buffer clone, dense roundtrip, and public `fromBuffer` copy boundary costs.

Every benchmark candidate is checked against an equivalent implementation before timing is reported. This script is a candidate-selection gate only; it must not directly rewrite integrated prover hot paths.

## Usage

```bash
npm run bench:prover-ops -- --shapes=16x16,32x16 --iterations=2 --warmup=1
```

Useful options:

- `--shapes=16x16,32x16`: comma-separated bivariate polynomial shapes.
- `--iterations=2`: measured iterations per candidate.
- `--warmup=1`: warmup iterations per candidate.
- `--seed=0x544f4b414d414b`: deterministic pseudo-random seed.
- `--json=tmp/timing/prover-operation-matrix.json`: structured report path.

## Promotion Rule

Do not promote a candidate into production prover code from this benchmark alone. A production change must also pass the relevant operation parity check, native testing-mode-style prover diagnostics, full prover runtime verification, and package distribution checks.

## Initial Local Matrix

Command:

```bash
npm run bench:prover-ops -- --shapes=16x16,32x16 --iterations=1 --warmup=0 --json=tmp/timing/prover-operation-matrix.json
```

Environment: local Node.js run, backend-wasm single-thread curve runtime.

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| 2d-ntt | current-toRouEvals | 16x16 | 0.344 |
| 2d-ntt | direct-biNttBuffer | 16x16 | 0.322 |
| 2d-ntt | transpose-only-cost | 16x16 | 0.032 |
| field-vector-mul | split-map-concat | 16x16 | 0.137 |
| field-vector-mul | tight-buffer-loop | 16x16 | 0.247 |
| linear-combination | current-linearCombinationBuffer | 16x16 | 0.389 |
| linear-combination | preallocated-addScaledPrefixAssign | 16x16 | 0.438 |
| division | current-ruffini | 16x16 | 0.494 |
| division | current-vanishing-opt | 16x16 | 0.535 |
| materialization | buffer-clone | 16x16 | 0.006 |
| materialization | toDense-fromDense-roundtrip | 16x16 | 0.044 |
| materialization | fromBuffer-copy | 16x16 | 0.010 |
| 2d-ntt | current-toRouEvals | 32x16 | 0.740 |
| 2d-ntt | direct-biNttBuffer | 32x16 | 0.706 |
| 2d-ntt | transpose-only-cost | 32x16 | 0.035 |
| field-vector-mul | split-map-concat | 32x16 | 0.154 |
| field-vector-mul | tight-buffer-loop | 32x16 | 0.163 |
| linear-combination | current-linearCombinationBuffer | 32x16 | 0.637 |
| linear-combination | preallocated-addScaledPrefixAssign | 32x16 | 0.640 |
| division | current-ruffini | 32x16 | 0.902 |
| division | current-vanishing-opt | 32x16 | 0.999 |
| materialization | buffer-clone | 32x16 | 0.002 |
| materialization | toDense-fromDense-roundtrip | 32x16 | 0.042 |
| materialization | fromBuffer-copy | 32x16 | 0.003 |

Interpretation:

- This initial run only proves that the five-candidate benchmark matrix is wired and produces correctness-checked timing records.
- It does not select a production optimization candidate. The shapes and iteration count are too small for a prover hot-path decision.
- The next useful run should use prover-representative shapes and enough iterations to separate arithmetic cost from measurement noise.
