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
- `--groups=2d-ntt,field-vector-mul`: comma-separated benchmark groups. Valid groups are `2d-ntt`, `field-vector-mul`, `linear-combination`, `division`, and `materialization`.
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

## Accepted Small Production Change

The `512x256` scaled matrix showed that `current-toRouEvals` and `direct-biNttBuffer` produce identical outputs and have nearly identical timing, while the direct path avoids an unconditional coefficient-buffer clone. Production `BivariatePolynomialBuffer.toRouEvals()` now skips the clone for non-coset true 2D transforms and calls `biNttBuffer()` directly.

Verification:

```bash
npm run polynomial:buffer:check
npm run typecheck
npm run bench:prover-ops -- --shapes=512x256 --iterations=1 --warmup=0 --json=tmp/timing/prover-operation-matrix-512x256-after-ntt-clone.json
```

Post-change `512x256` timing:

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| 2d-ntt | current-toRouEvals | 512x256 | 213.667 |
| 2d-ntt | direct-biNttBuffer | 512x256 | 215.078 |
| 2d-ntt | transpose-only-cost | 512x256 | 6.578 |

This does not settle the larger NTT strategy. Transpose-backed or primitive-parallel row/column transforms still require dedicated candidate benchmarks before any deeper production rewrite.

## Accepted Materialization Cache

The `4096x256` selected matrix showed that dense roundtrip materialization is expensive at prover-representative shape:

```bash
npm run bench:prover-ops -- --shapes=4096x256 --groups=2d-ntt,field-vector-mul,materialization --iterations=1 --warmup=0 --json=tmp/timing/prover-operation-matrix-4096x256-selected.json
```

Selected result:

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| 2d-ntt | current-toRouEvals | 4096x256 | 2052.874 |
| 2d-ntt | direct-biNttBuffer | 4096x256 | 2054.719 |
| field-vector-mul | split-map-concat | 4096x256 | 483.189 |
| field-vector-mul | tight-buffer-loop | 4096x256 | 254.164 |
| materialization | buffer-clone | 4096x256 | 0.777 |
| materialization | toDense-fromDense-roundtrip | 4096x256 | 169.243 |
| materialization | fromBuffer-copy | 4096x256 | 1.021 |

Production `ProverState` now builds `instanceBuffers` and `witnessBuffers` once and the integrated prover reuses those buffers instead of repeatedly calling `BivariatePolynomialBuffer.fromDense(...)` for state-owned witness and instance polynomials.

Verification:

```bash
npm run typecheck
npm run typecheck:scripts
npm run prover:witness:check
npm run prover:ops:check
npm run prover:check
npm run prover:testing-mode:check
npm run build
npm pack --dry-run --json
```

Measured full prover check after the cache:

| step | duration |
| --- | ---: |
| build prover binding | 2.14 s |
| prove0 diagnostic label | 76.23 s |
| prove1 diagnostic label | 24.43 s |
| prove2 diagnostic label | 261.47 s |
| prove3 diagnostic label | 9.68 s |
| prove4 diagnostic label | 147.41 s |
| verify generated proof | 19 ms |

Historical `prove*` names in the table are diagnostic labels only.
