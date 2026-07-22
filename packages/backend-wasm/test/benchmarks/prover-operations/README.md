# Prover Operation Benchmark Matrix

Audience: backend-wasm developers selecting measured prover hot-path optimizations before changing production prover code.

This benchmark is diagnostics-only. It is not imported by `src/`, is not part of package distribution, and writes structured reports under ignored `tmp/timing/`.

The matrix covers the optimization candidate groups currently required by `tmp/planning.md`:

- `2d-ntt`: current 2D ROU conversion, direct `biNttBuffer`, transpose-scheduled row/column NTT, and transpose overhead for future contiguous row/column candidates.
- `field-vector-mul`: allocation-heavy split/map/concat multiplication versus a tight indexed buffer loop.
- `polynomial-mul`: current `BivariatePolynomialBuffer.mul` versus generic full 2D NTT references, including benchmark-only concurrent-input ROU and transpose-scheduled candidates.
- `linear-combination`: current add/sub/scale/addScaled/linear-combination paths versus diagnostics-only same-shape flat-buffer candidates.
- `division`: current Ruffini opening division and native-style vanishing quotient recurrence with reconstruction checks.
- `materialization`: buffer clone, dense roundtrip, and public `fromBuffer` copy boundary costs.

Every benchmark candidate is checked against an equivalent implementation before timing is reported. This script is a candidate-selection gate only; it must not directly rewrite integrated prover hot paths.

## Usage

```bash
npm run bench:prover-ops -- --shapes=16x16,32x16 --iterations=2 --warmup=1
```

Useful options:

- `--shapes=16x16,32x16`: comma-separated bivariate polynomial shapes.
- `--groups=2d-ntt,field-vector-mul`: comma-separated benchmark groups. Valid groups are `2d-ntt`, `field-vector-mul`, `polynomial-mul`, `linear-combination`, `division`, and `materialization`.
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

## Candidate 1: Same-Shape Flat Linear Kernels

The first linear-operation candidate keeps the same arithmetic semantics as the current polynomial buffer implementation and changes only the coefficient access pattern for same-shape inputs. It uses flat byte offsets over raw coefficient buffers and avoids per-coefficient `getCoeff()` / `readBufferElement()` allocation paths where that is safe.

This is diagnostics-only. The benchmark checks byte-for-byte parity before timing:

- `add`, `sub`, `scale`, `addScaledAssign`, and `linearCombinationBuffer` parity against the current implementation.
- Factors `0`, `1`, `-1`, and a non-unit scalar.
- Self-aliasing `addScaledAssign` behavior.
- Representative shapes from tiny unit cases to prover-scale buffers.

Command:

```bash
npm run bench:prover-ops -- --groups=linear-combination --shapes=4x4,32x32,512x256,1024x256,4096x256 --iterations=1 --warmup=0 --json=tmp/timing/linear-combination-candidate1.json
```

Representative result:

| candidate | 4x4 | 32x32 | 512x256 | 1024x256 | 4096x256 |
| --- | ---: | ---: | ---: | ---: | ---: |
| current-add | 0.025 | 0.426 | 54.670 | 110.732 | 451.306 |
| candidate1-flat-same-shape-add | 0.019 | 0.185 | 21.573 | 43.478 | 177.008 |
| current-sub | 0.037 | 0.573 | 70.418 | 141.715 | 568.337 |
| candidate1-flat-same-shape-sub | 0.021 | 0.326 | 32.106 | 64.776 | 265.697 |
| current-scale | 0.011 | 0.241 | 26.511 | 54.103 | 218.804 |
| candidate1-flat-same-shape-scale | 0.010 | 0.240 | 27.486 | 53.059 | 216.390 |
| current-addScaledAssign | 0.017 | 0.448 | 45.415 | 92.343 | 376.203 |
| candidate1-flat-same-shape-addScaled | 0.017 | 0.413 | 42.976 | 90.228 | 354.706 |
| current-linearCombinationBuffer | 0.057 | 1.578 | 166.367 | 330.106 | 1337.317 |
| candidate1-flat-same-shape-linearCombination | 0.037 | 1.192 | 130.456 | 264.506 | 1078.967 |

Initial conclusion:

- Same-shape add/sub are materially faster, roughly 2.1x to 2.6x at prover-scale shapes.
- Same-shape linear combination is consistently faster, roughly 1.2x to 1.3x at prover-scale shapes.
- Generic non-unit `scale` and `addScaledAssign` improve little on their own, so they should not be promoted in isolation.
- Production promotion should wait until the next prefix-shape candidate is tested, because integrated prover calls still include both same-shape and prefix-shape paths.

## Accepted Axis-Specific Multiplication

Strict prover timing showed the dominant non-MSM cost had moved to polynomial multiplication and combination, especially copy-quotient and opening numerator construction. Several hot multiplications have one operand that is X-only or Y-only, but the previous buffer multiplication path still forced a full 2D NTT product.

`BivariatePolynomialBuffer.mul()` now detects X-only and Y-only factors and performs independent 1D NTT products along the relevant axis. It preserves the same output shape and coefficients as the generic full 2D NTT reference.

Representative benchmark:

```bash
npm run bench:prover-ops -- --shapes=4096x256 --groups=polynomial-mul --iterations=1 --warmup=0 --json=tmp/timing/prover-operation-polynomial-mul-4096x256.json
```

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| polynomial-mul | current-x-axis-factor | 4096x256 | 5536.177 |
| polynomial-mul | generic-2d-ntt-x-axis-factor | 4096x256 | 13155.656 |
| polynomial-mul | current-y-axis-factor | 4096x256 | 4005.074 |
| polynomial-mul | generic-2d-ntt-y-axis-factor | 4096x256 | 13009.296 |

Verification:

```bash
npm run typecheck
npm run typecheck:scripts
npm run polynomial:buffer:check
npm run prover:ops:polynomial
npm run prover:testing-mode:check
npm run build
npm pack --dry-run --json
```

Observed diagnostics after this change:

| step | duration |
| --- | ---: |
| prove2 diagnostic label | 182.32 s |
| prove4 diagnostic label | 120.59 s |
| verify generated proof | 14 ms |

Historical `prove*` names in the table are diagnostic labels only.

### Rejected Generic Concurrent ROU Candidate

The `polynomial-mul` benchmark also compares the current generic bivariate multiplication path against a diagnostic-only candidate that starts left and right ROU conversions concurrently before pointwise multiplication.

Representative benchmark:

```bash
npm run bench:prover-ops -- --shapes=1024x256 --groups=polynomial-mul --iterations=1 --warmup=0 --json=tmp/timing/prover-operation-polynomial-mul-generic-1024x256.json
```

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| polynomial-mul | current-bivariate | 1024x256 | 6328.878 |
| polynomial-mul | concurrent-input-rou-bivariate | 1024x256 | 6348.507 |

The concurrent candidate is not faster in this local run, so it must not be promoted to production without new representative timing evidence.

### Row/Column Scheduling Candidate

The `2d-ntt` and `polynomial-mul` groups now include a benchmark-only transpose-scheduled candidate. It transforms Y rows, transposes the buffer, transforms former X columns as contiguous rows, then transposes the result back. This keeps the same mathematical transform and checks output parity against the current path before timing.

Representative benchmark:

```bash
npm run bench:prover-ops -- --groups=2d-ntt,polynomial-mul --shapes=1024x256 --iterations=1 --warmup=0 --json=tmp/timing/row-column-scheduling-benchmark-1024x256.json
```

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| 2d-ntt | current-toRouEvals | 1024x256 | 459.506 |
| 2d-ntt | direct-biNttBuffer | 1024x256 | 460.178 |
| 2d-ntt | transpose-scheduled-biNttBuffer | 1024x256 | 454.413 |
| 2d-ntt | transpose-only-cost | 1024x256 | 12.413 |
| polynomial-mul | current-bivariate | 1024x256 | 6473.963 |
| polynomial-mul | concurrent-input-rou-bivariate | 1024x256 | 6490.954 |
| polynomial-mul | transpose-scheduled-bivariate | 1024x256 | 6275.907 |

This result is mildly positive for the transpose-scheduled candidate, but it is not enough for production promotion. The next step is a representative shape sweep with repeated iterations, followed by parity diagnostics for forward, inverse, and coset variants if the timing win remains stable.

Repeated local sweep:

```bash
npm run bench:prover-ops -- --groups=2d-ntt,polynomial-mul --shapes=512x256,1024x256 --iterations=2 --warmup=1 --json=tmp/timing/row-column-scheduling-shape-sweep.json
```

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| 2d-ntt | current-toRouEvals | 512x256 | 216.648 |
| 2d-ntt | transpose-scheduled-biNttBuffer | 512x256 | 216.411 |
| polynomial-mul | current-bivariate | 512x256 | 3085.133 |
| polynomial-mul | transpose-scheduled-bivariate | 512x256 | 3034.095 |
| 2d-ntt | current-toRouEvals | 1024x256 | 465.771 |
| 2d-ntt | transpose-scheduled-biNttBuffer | 1024x256 | 456.233 |
| polynomial-mul | current-bivariate | 1024x256 | 6493.067 |
| polynomial-mul | transpose-scheduled-bivariate | 1024x256 | 6295.499 |

The repeated sweep kept the candidate alive but was not enough on its own for production promotion.

Fixture-shape benchmark:

```bash
npm run bench:prover-ops -- --groups=2d-ntt,polynomial-mul --shapes=4096x256 --iterations=1 --warmup=0 --json=tmp/timing/row-column-scheduling-fixture-shape-4096x256.json
```

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| 2d-ntt | current-toRouEvals | 4096x256 | 2017.446 |
| 2d-ntt | transpose-scheduled-biNttBuffer | 4096x256 | 1954.511 |
| polynomial-mul | current-bivariate | 4096x256 | 28059.481 |
| polynomial-mul | transpose-scheduled-bivariate | 4096x256 | 26910.071 |

The fixture-shape operation benchmark was positive, so the candidate was temporarily tested in production `biNttBuffer()`. The full integrated prover timing did not confirm the improvement.

Verification:

```bash
npm run typecheck
npm run typecheck:scripts
npm run polynomial:buffer:check
npm run prover:ops:check
npm run prover:testing-mode:check
npm pack --dry-run --json
```

Temporary production spot benchmark:

```bash
npm run bench:prover-ops -- --groups=2d-ntt,polynomial-mul --shapes=1024x256 --iterations=1 --warmup=0 --json=tmp/timing/row-column-scheduling-after-production-1024x256.json
```

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| 2d-ntt | current-toRouEvals | 1024x256 | 462.666 |
| 2d-ntt | direct-biNttBuffer | 1024x256 | 454.136 |
| polynomial-mul | current-bivariate | 1024x256 | 6249.329 |

Full integrated timing after the temporary production change:

| category | before | after |
| --- | ---: | ---: |
| stage | 375.46 s | 397.60 s |
| poly_detail | 339.43 s | 359.02 s |
| poly | 228.27 s | 244.10 s |
| encode | 115.06 s | 119.43 s |

The candidate is therefore not promoted to production. Keep it in this benchmark as a diagnostic reference only.

### Accepted Shared-Right Local Multiplication Kernel

The `polynomial-mul` benchmark includes a diagnostics-only candidate for two bivariate products that share the same right operand. This matches the copy-quotient pattern where two products use the same `fXY` polynomial. The accepted production change is deliberately local: it reuses the shared right operand ROU evals only inside that expression and does not introduce a global eval cache.

Representative benchmarks:

```bash
npm run bench:prover-ops -- --groups=polynomial-mul --shapes=1024x256 --iterations=1 --warmup=0 --json=tmp/timing/shared-right-1024x256.json
npm run bench:prover-ops -- --groups=polynomial-mul --shapes=4096x256 --iterations=1 --warmup=0 --json=tmp/timing/shared-right-4096x256.json
```

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| polynomial-mul | current-two-bivariate-shared-right | 1024x256 | 12241.948 |
| polynomial-mul | shared-right-rou-two-bivariate | 1024x256 | 10345.247 |
| polynomial-mul | current-two-bivariate-shared-right | 4096x256 | 52897.629 |
| polynomial-mul | shared-right-rou-two-bivariate | 4096x256 | 44619.771 |

Verification:

```bash
npm run typecheck
npm run typecheck:scripts
npm run prover:ops:polynomial
npm run prover:ops:commitment
npm run prover:testing-mode:check
npm run prover:stage-timing:check
```

Observed diagnostics after this change:

| signal | before | after |
| --- | ---: | ---: |
| testing-mode prove2 diagnostic label | 167.13 s | 152.58 s |
| stage-timing prove2 diagnostic label | 158.81 s | 152.67 s |
| stage-timing stage total | 355.31 s | 349.14 s |
| stage-timing poly total | 213.36 s | 207.43 s |

The stage-timing script mirrors the production shared-right path and reports `poly.combine.prove2.shared_f_products` as a single local expression span. Do not generalize this into broad expression rewriting without a local benchmark and full diagnostics for the specific expression.

## Accepted Scaled-Add Fast Path

`linearCombinationBuffer()` ultimately uses `BivariatePolynomialBuffer.addScaledPrefixAssign()`. Many integrated prover terms use scale factors equal to `0`, `1`, or `-1`, but the previous implementation still routed every source coefficient through a field multiplication.

`addScaledAssign()` and `addScaledPrefixAssign()` now skip work for zero factors and avoid field multiplication for `1` and `-1` factors.

Representative benchmark:

```bash
npm run bench:prover-ops -- --shapes=4096x256 --groups=linear-combination --iterations=1 --warmup=0 --json=tmp/timing/prover-operation-linear-combination-factor-fast-path.json
```

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| linear-combination | current-linearCombinationBuffer | 4096x256 | 1232.803 |
| linear-combination | preallocated-addScaledPrefixAssign | 4096x256 | 1149.804 |

The benchmark uses non-unit synthetic factors, so it mainly confirms that the fast-path checks do not materially regress the generic path. The integrated prover diagnostics are the relevant acceptance signal for unit and negative-unit factors.

Verification:

```bash
npm run typecheck
npm run polynomial:buffer:check
npm run prover:testing-mode:check
npm run build
npm pack --dry-run --json
```

Observed diagnostics after this change:

| step | duration |
| --- | ---: |
| prove2 diagnostic label | 166.27 s |
| prove4 diagnostic label | 106.44 s |
| verify generated proof | 17 ms |

Historical `prove*` names in the table are diagnostic labels only.
