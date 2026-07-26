# Prover Operation Benchmarks

Audience: backend-wasm developers measuring and regression-testing production
prover hot-path optimizations.

The retained focused benchmarks are diagnostics-only. They are not imported by
`src/`, are not part of package distribution, and write structured reports
under ignored `tmp/`.

For chronological full-prover optimization history, related commits, and before/after timing tables, see [`docs/optimization/prover-optimization-history.md`](../../../docs/optimization/prover-optimization-history.md).

The broad `bench:prover-ops` candidate matrix was removed after its accepted
coverage was transferred to focused NTT, multiplication, evaluation, linear,
division, and materialization benchmarks. Commands using that name later in
this file are historical invocation records, not current package scripts.

## Dedicated K0 Multiplication Benchmark

`bench-k0-multiplication.ts` isolates `Lagrange K0(X) * P(X,Y)` from the four measured prover call sites. Candidate implementations remain diagnostics-only until all independent candidates and compatible combinations have been measured.

The shape syntax is `<mI>x<inputXSize>x<inputYSize>`. The benchmark checks small cases against both current production and a direct dense convolution oracle before representative timing.

### Candidate A: Sequential Raw-Buffer Data Path

Candidate A preserves the current per-Y-column forward FFT, pointwise multiplication, inverse FFT, and sequential scheduling. It changes only coefficient access and ownership:

- direct validated byte offsets replace repeated coefficient accessor allocation;
- the freshly allocated output is transferred through `fromOwnedBuffer(...)` instead of cloned by `fromBuffer(...)`.

Command:

```bash
npm run bench:k0-mul -- --shapes=4096x8192x512,4096x8192x256,4096x4096x512 --candidates=current-production,candidate-a-sequential-raw-owned --iterations=3 --warmup=1 --json=tmp/timing/k0-candidate-a-representative.json
```

| shape | current median | Candidate A median | reduction |
| --- | ---: | ---: | ---: |
| `4096x8192x512` | 7692.693 ms | 7584.607 ms | 1.4% |
| `4096x8192x256` | 3880.911 ms | 3685.530 ms | 5.0% |
| `4096x4096x512` | 3993.267 ms | 3940.976 ms | 1.3% |
| four-call weighted total | 23259.564 ms | 22795.720 ms | 2.0% |

The four-call total counts `4096x8192x512` twice and each other shape once. Candidate A passes exact byte parity and the independent small-shape convolution oracle. The gain is positive but too small for standalone production promotion; retain it only for compatibility review after the batch and K0-specific candidates are measured.

### Candidate B: Batched X-Univariate Multiplication

Candidate B packs all X columns into contiguous segments once, invokes one batched forward transform and one batched inverse transform, applies the shared X-factor evaluations to every segment, and restores row-major output.

Command:

```bash
npm run bench:k0-mul -- --shapes=4096x8192x512,4096x8192x256,4096x4096x512 --candidates=current-production,candidate-b-batched-x-univariate --iterations=3 --warmup=1 --json=tmp/timing/k0-candidate-b-representative.json
```

| shape | current median | Candidate B median | reduction | Candidate B explicit temporary |
| --- | ---: | ---: | ---: | ---: |
| `4096x8192x512` | 7295.337 ms | 5219.425 ms | 28.5% | 768.5 MiB |
| `4096x8192x256` | 3720.978 ms | 2631.717 ms | 29.3% | 384.5 MiB |
| `4096x4096x512` | 3896.726 ms | 2609.828 ms | 33.0% | 384.3 MiB |
| four-call weighted total | 22208.378 ms | 15680.395 ms | 29.4% | n/a |

Candidate B passes exact byte parity and the independent small-shape convolution oracle. The result confirms that batching the independent X transforms removes material scheduling overhead. It remains diagnostics-only until the K0-specific sliding-window candidate and later compatible combinations are measured. The temporary-byte column covers caller-owned full-size buffers and factor evaluations; internal `batchFftBuffer(...)` worker-task allocations can increase the actual peak further.

### Candidate C: K0 Sliding-Window Convolution

Candidate C uses the exact K0 identity:

```text
K0(X) = mI^-1 * (1 + X + ... + X^(mI-1))
S[k] = S[k-1] + P[k] - P[k-mI]
Q[k] = mI^-1 * S[k]
```

The independent implementation removes all FFT/IFFT work but deliberately retains accessor-based reads/writes, per-output scalar multiplication, and final output cloning. This isolates the algorithmic change from Candidate A and the later combination work.

Command:

```bash
npm run bench:k0-mul -- --shapes=4096x8192x512,4096x8192x256,4096x4096x512 --candidates=current-production,candidate-c-k0-sliding-scalar --iterations=3 --warmup=1 --json=tmp/timing/k0-candidate-c-representative.json
```

| shape | current median | Candidate C median | reduction |
| --- | ---: | ---: | ---: |
| `4096x8192x512` | 7725.439 ms | 3409.564 ms | 55.9% |
| `4096x8192x256` | 3878.603 ms | 1722.118 ms | 55.6% |
| `4096x4096x512` | 3876.899 ms | 1679.916 ms | 56.7% |
| four-call weighted total | 23206.380 ms | 10221.162 ms | 56.0% |

Candidate C passes exact byte parity and the independent direct-convolution oracle. It is faster than Candidate B without Candidate B's full-size batched-transform temporaries. Production promotion still waits for the planned raw-buffer/owned-output and batch-scaling combination measurements.

### C+A Combination: Sliding Window With Raw Owned Output

After all independent candidates were measured, Candidate C was combined with Candidate A's direct byte views and owned-output construction. Per-output scalar multiplication remains unchanged in this combination.

| shape | current median | independent C median | C+A median | C+A vs current |
| --- | ---: | ---: | ---: | ---: |
| `4096x8192x512` | 7493.340 ms | 3424.459 ms | 3261.249 ms | 56.5% |
| `4096x8192x256` | 3822.428 ms | 1708.345 ms | 1633.597 ms | 57.3% |
| `4096x4096x512` | 3926.171 ms | 1677.897 ms | 1612.836 ms | 58.9% |
| four-call weighted total | 22735.279 ms | 10235.160 ms | 9768.931 ms | 57.0% |

C+A improves the weighted independent-C result by a further `4.6%`. It removes the cloned full-size output; the remaining caller-owned temporary is one Y-row window, approximately 16 KiB when `ySize=512`.

### C+A+Batch-Scale Combination

The final combination writes unscaled sliding sums into one output-sized buffer and applies `batchApplyKeyBuffer(output, mI^-1, 1)` once. This moves scalar multiplication from the JavaScript coefficient loop to the ffjavascript worker primitive.

| shape | current median | C+A scalar median | C+A+batch median | final reduction |
| --- | ---: | ---: | ---: | ---: |
| `4096x8192x512` | 7342.486 ms | 3149.334 ms | 1776.129 ms | 75.8% |
| `4096x8192x256` | 3783.656 ms | 1610.060 ms | 903.266 ms | 76.1% |
| `4096x4096x512` | 3973.504 ms | 1623.249 ms | 897.551 ms | 77.4% |
| four-call weighted total | 22442.132 ms | 9531.977 ms | 5353.075 ms | 76.1% |

The batch-scaling combination is `43.8%` faster than C+A on the weighted workload. Its explicit largest-shape temporary is one 256 MiB unscaled output plus a small Y-row window, similar to the reported current path's 258 MiB and substantially below Candidate B's 768.5 MiB. This is the selected production candidate.

### Production Promotion

Related production commit: `c02865f9` (`Optimize Lagrange K0 multiplication`).

Production now uses the dedicated `multiplyByLagrangeK0(polynomial, mI)` helper at exactly the four measured K0 product call sites. The helper uses the selected sliding-window recurrence, direct coefficient-buffer views, owned output construction, and one whole-buffer `batchApplyKeyBuffer(...)` scaling pass. Generic X-univariate multiplication remains unchanged.

The isolated benchmark predicted a `76.1%` weighted reduction. In the integrated timing runner, the four K0 events decreased from `18.584 s` to `5.491 s` (`70.5%`). The complete prover result is smaller because all non-K0 work remains:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| four K0 multiplication events | 18.584 s | 5.491 s | -13.093 s |
| `polynomial.combination_with_multiplication` | 66.51 s | 53.64 s | -12.87 s |
| `field.operations` | 140.92 s | 127.59 s | -13.33 s |
| prover stage total | 255.44 s | 242.08 s | -13.36 s |
| total wall | 263.51 s | 250.15 s | -13.36 s |

Exact parity, operation checks, native testing-mode-style diagnostics, Node proof generation and verification, stage timing, build, Chromium proof generation and verification, and package-content inspection all pass. Chromium generated the 2408-byte proof in `243.08 s` and verified it in `19 ms`. The package dry run contains no test, benchmark, script, temporary, or diagnostics paths.

## Dedicated Special-Form Multiplication Benchmark

`bench-special-form-multiplication.ts` isolates five low-degree products that previously composed full-buffer `scale`, monomial shift, and add/subtract operations:

- `(X-1)P`
- `(1-X)P`
- `(a+bX)P`
- `(a+bY)P`
- `(c+aX+bY)P`, used by term9

Each candidate writes directly into one owned output buffer. The benchmark retains the pre-promotion formulas as `legacy-production`, retains a benchmark-local fused implementation as an independent oracle, and compares both with `current-production`.

Independent pre-promotion results at input shape `4096x256`:

| operation | legacy median | fused median | reduction |
| --- | ---: | ---: | ---: |
| `(X-1)P` | 610.016 ms | 168.640 ms | 72.4% |
| `(1-X)P` | 607.958 ms | 169.154 ms | 72.2% |
| X-linear | 1264.852 ms | 538.572 ms | 57.4% |
| Y-linear | 1264.385 ms | 540.269 ms | 57.3% |
| term9 | 2495.228 ms | 869.045 ms | 65.2% |

All five candidates passed full-buffer byte parity on deterministic full, sparse, zero, and boundary inputs before production code changed. In the combined pre-promotion run, the five medians totaled `6269.880 ms` legacy versus `2323.621 ms` fused (`62.9%`).

Related production commit: `06ea4a26` (`Fuse special-form polynomial products`).

The post-promotion representative run measured `6271.535 ms` for the retained legacy formulas and `2320.722 ms` for current production (`63.0%`). The production helpers preserve their existing names, call sites, output-shape behavior, and timing categories.

Integrated stage timing:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| ten promoted special-form events | 17.67 s | 6.56 s | -11.11 s |
| `polynomial.combination_with_multiplication` | 53.64 s | 42.79 s | -10.85 s |
| `field.operations` | 127.59 s | 118.62 s | -8.97 s |
| prover stage total | 242.08 s | 234.00 s | -8.08 s |
| total wall | 250.15 s | 241.90 s | -8.25 s |

Chromium generated the 2408-byte proof in `233.30 s` and verified it in `24 ms`. Type checks, operation parity, native testing-mode-style diagnostics, Node proof generation and verification, stage timing, build, browser verification, and package-content inspection pass.

## Lagrange KL Multiplication Benchmark

`bench-lagrange-kl-multiplication.ts` isolates both construction of
`K_{mI-1}(X)L_{sMax-1}(Y)` and the single prover product that multiplies this
structured polynomial by `r(X,Y)-1`.

The construction candidate uses the exact separable coefficient formula:

```text
K(X)L(Y)[x,y] = (mI * sMax)^-1 * omega_mI^x * omega_sMax^y
```

The multiplication candidate applies weighted sliding recurrences along X and
then Y. It avoids materializing the KL polynomial and avoids generic forward
and inverse 2D transforms. The benchmark keeps KL construction and KL
multiplication as independent rows, checks them against retained legacy
formulas, and uses a small dense-convolution oracle.

Representative independent result at `mI=4096`, `sMax=256`, and polynomial
shape `4096x256`:

| operation | legacy median | candidate median | reduction |
| --- | ---: | ---: | ---: |
| KL construction | 940.573 ms | 195.987 ms | 79.2% |
| KL multiplication | 5454.478 ms | 2368.567 ms | 56.6% |
| independent combined path | 6409.385 ms | 2564.554 ms | 60.0% |

The selected recurrence uses approximately `192 MiB` of explicitly owned
temporary data at the representative shape, compared with approximately
`384 MiB` for the retained generic path.

Related production commit: `5f8723bd` (`Optimize Lagrange KL multiplication`).

Production now constructs KL coefficients directly and uses the semantic
`multiplyByLagrangeKl(...)` helper only at the measured `p1` call site. The
post-promotion benchmark measured `6376.665 ms` for the retained legacy
construction plus multiplication and `2578.966 ms` for current production, a
`59.6%` reduction.

Integrated stage timing:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| KL construction plus `p1` multiplication | 7.304 s | 2.820 s | -4.484 s |
| `polynomial.combination_with_multiplication` | 42.79 s | 37.96 s | -4.83 s |
| `field.operations` | 118.62 s | 113.15 s | -5.47 s |
| prover stage total | 234.00 s | 228.26 s | -5.74 s |
| total wall | 241.90 s | 236.86 s | -5.04 s |

Chromium generated the 2408-byte proof in `229.72 s` and verified it in
`20 ms`. Type checks, operation parity, native testing-mode-style diagnostics,
Node proof generation and verification, stage timing, build, browser
verification, and package-content inspection pass.

## Shifted ROU Product Benchmark

`bench-shifted-rou-products.ts` isolates the three related copy-quotient
products:

```text
r(X,Y) * g(X,Y)
r(omega_mI^-1 X,Y) * f(X,Y)
r(omega_mI^-1 X,omega_sMax^-1 Y) * f(X,Y)
```

For an `Nx x Ny` multiplication evaluation domain, scaling coefficients by
`omega_mI^-1` and `omega_sMax^-1` is exactly equivalent to cyclic evaluation
index shifts by `-Nx/mI` on X and `-Ny/sMax` on Y. The real multiplication
domain is `2mI x 2sMax`, so the two shifted products read the single `r`
evaluation buffer at offsets `(-2, 0)` and `(-2, -2)`.

The benchmark checks this relation directly against separately transformed
scaled polynomials on small domains, then checks all three output coefficient
buffers byte-for-byte.

Representative independent result at input shape `4096x256`:

| candidate | median | reduction | output | explicit temporary |
| --- | ---: | ---: | ---: | ---: |
| current production | 14703.416 ms | n/a | 384 MiB | 384 MiB |
| shifted ROU reuse | 11505.709 ms | 21.7% | 384 MiB | 384 MiB |

Related production commit: `13cf6744` (`Reuse shifted ROU evaluations in copy
quotient`).

The post-promotion benchmark retains the old shared-right implementation
locally. It measured `14456.432 ms` for the legacy path and `11483.241 ms` for
current production, a `20.6%` reduction.

Integrated stage timing:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_with_multiplication` | 37.96 s | 34.73 s | -3.23 s |
| `field.operations` | 113.15 s | 110.58 s | -2.57 s |
| prover stage total | 228.26 s | 225.71 s | -2.55 s |
| total wall | 236.86 s | 234.06 s | -2.80 s |

Chromium generated the 2408-byte proof in `226.78 s` and verified it in
`21 ms`. Type checks, operation parity, native testing-mode-style diagnostics,
Node proof generation and verification, stage timing, build, browser
verification, and package-content inspection pass.

The later whole-buffer WASM multiplication campaign retained the scalar
shifted implementation as its baseline. At `4096x256`, the scalar path
measured `11676.935 ms`, the single-task WASM path measured `9629.446 ms`, and
the worker-sharded production path measured `8818.729 ms`. The promoted path
is `24.5%` faster than the scalar baseline.

## Generic Multiplication Buffer Benchmark

`bench-generic-multiplication-buffers.ts` isolates the remaining standalone
generic product, `prove0.p0XY.mul`, at two `4096x256` inputs and one
`8192x512` output.

The retained production decomposition measured:

| stage | median |
| --- | ---: |
| degree discovery | 0.013 ms |
| left padding | 81.158 ms |
| left forward NTT | 1348.603 ms |
| right padding | 75.077 ms |
| right forward NTT | 1358.069 ms |
| pointwise multiplication | 1005.221 ms |
| inverse NTT and output | 1491.710 ms |

Independent candidate results:

| candidate | current median | candidate median | reduction |
| --- | ---: | ---: | ---: |
| D1: row-copy padding | 5363.381 ms | 5202.393 ms | 3.0% |
| D2: raw pointwise | 5348.244 ms | 5330.142 ms | 0.34% |

D2's independent ranges overlapped, so it was not accepted alone. The
subsequent compatibility run measured:

| path | median | min | max |
| --- | ---: | ---: | ---: |
| current | 5337.722 ms | 5322.863 ms | 5385.810 ms |
| D1 | 5246.047 ms | 5190.763 ms | 5322.891 ms |
| D2 | 5270.137 ms | 5262.221 ms | 5365.167 ms |
| D1+D2 | 5175.420 ms | 5135.815 ms | 5180.980 ms |

The selected D1+D2 path is `3.0%` faster than current in the compatibility
run, and its maximum is below the current minimum.

Related production commit: `348db687` (`Optimize generic polynomial
multiplication buffers`).

Production applies row-copy padding and validated raw pointwise writes only
inside generic `BivariatePolynomialBuffer.mul(...)`. It does not change public
`resize(...)`, NTT scheduling, univariate multiplication, or protocol-specific
helpers. The post-promotion benchmark measured `5374.002 ms` for retained
legacy production and `5138.923 ms` for current production (`4.4%`).

Integrated stage timing:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `prove0.p0XY.mul` | 6.336 s | 6.055 s | -0.281 s |
| `polynomial.combination_with_multiplication` | 34.73 s | 34.17 s | -0.56 s |
| `field.operations` | 110.58 s | 110.07 s | -0.51 s |
| prover stage total | 225.71 s | 225.27 s | -0.44 s |
| total wall | 234.06 s | 233.71 s | -0.35 s |

Only the `prove0.p0XY.mul` row is the direct production effect. Smaller
changes in unrelated rows are run-to-run variation.

The later whole-buffer WASM multiplication campaign retained that scalar
implementation as its baseline. At `4096x256`, the scalar path measured
`5178.222 ms`, the single-task WASM path measured `4516.056 ms`, and the
worker-sharded production path measured `4304.207 ms`. The promoted path is
`16.9%` faster than the scalar baseline. Isolated pointwise multiplication
measured `958.958 ms`, `322.108 ms`, and `68.986 ms`, respectively.

Chromium generated the 2408-byte proof in `226.13 s` and verified it in
`24 ms`. Type checks, operation parity, native testing-mode-style diagnostics,
Node proof generation and verification, stage timing, build, browser
verification, and package-content inspection pass.

## Dedicated Ruffini Benchmark

`bench-ruffini-division.ts` isolates the bivariate Ruffini opening path. It is the benchmark-first gate for changes to the production synthetic-division implementation.

The benchmark currently compares:

- `current-production`: the promoted Y-column-sharded WASM X recurrence followed by one dependent WASM Y recurrence.
- `scalar-production-baseline`: the retained pre-promotion row-major, validated-once raw-buffer recurrence.
- `candidate-a-row-major-x`: the historical Candidate A decomposition, using row-major X steps with accessor-based coefficient reads and writes.
- `candidate-b-raw-buffer`: the historical Candidate B decomposition, using the old fixed-Y traversal with one-time validation and direct raw-buffer offsets.
- `candidate-ab-row-major-raw-buffer`: the benchmark-local A+B scalar implementation.
- `candidate-wasm-single-task`: whole-loop WASM recurrences on the caller thread.
- `worker-kernel-mirror`: a benchmark-local mirror of the current production worker-sharded kernel.

Use `--candidates=current-production,scalar-production-baseline,candidate-wasm-single-task` to compare current production with the pre-promotion scalar path and caller-thread WASM. `current-production` is mandatory in every candidate selection.

Before timing, it checks exact quotient and remainder bytes against production and independently reconstructs the input polynomial. Edge-case parity covers zero, constant, X-only, Y-only, and general bivariate polynomials.

Smoke command:

```bash
npm run bench:ruffini -- --shapes=4x2,8x4,1x1,8x1,1x8 --iterations=3 --warmup=1 --json=tmp/timing/ruffini-division-smoke.json
```

Representative prover-shape command:

```bash
npm run bench:ruffini -- --shapes=8192x512,16384x512,128x1 --iterations=3 --warmup=1 --json=tmp/timing/ruffini-division-representative.json
```

When all three representative shapes are present, the report includes a derived five-call workload estimate corresponding to three `8192x512` divisions, one `16384x512` division, and one `128x1` division. Timings include result allocation and construction. Reports also record the input, output, and algorithm-owned temporary buffer sizes.

### Candidate A Result

Command:

```bash
npm run bench:ruffini -- --shapes=8192x512,16384x512,128x1 --iterations=5 --warmup=1 --json=tmp/timing/ruffini-division-representative.json
```

Environment: local Node.js run with the backend-wasm single-thread curve runtime before production promotion. Candidate order alternates between measured iterations.

| shape | current median | Candidate A median | median reduction |
| --- | ---: | ---: | ---: |
| `8192x512` | 1875.670 ms | 1596.064 ms | 14.9% |
| `16384x512` | 3760.494 ms | 3149.598 ms | 16.2% |
| `128x1` | 0.051 ms | 0.055 ms | -7.8% |
| five-call weighted estimate | 9387.557 ms | 7937.845 ms | 15.4% |

Candidate A passed exact quotient/remainder parity and independent reconstruction for all smoke and representative shapes. The large prover shapes showed a repeatable gain, while the negligible `128x1` case regressed by about four microseconds. This independent result was recorded before any combination or production promotion.

### Candidate B Result

Command:

```bash
npm run bench:ruffini -- --shapes=8192x512,16384x512,128x1 --candidates=current-production,candidate-b-raw-buffer --iterations=5 --warmup=1 --json=tmp/timing/ruffini-division-b-representative.json
```

| shape | current median | Candidate B median | median reduction |
| --- | ---: | ---: | ---: |
| `8192x512` | 1926.458 ms | 1755.448 ms | 8.9% |
| `16384x512` | 3753.662 ms | 3512.297 ms | 6.4% |
| `128x1` | 0.051 ms | 0.055 ms | -7.8% |
| five-call weighted estimate | 9533.085 ms | 8778.695 ms | 7.9% |

Candidate B retained the pre-promotion fixed-Y traversal and changed only coefficient access: field width and points were checked once, then the recurrence used direct byte offsets and `subarray` views. It passed exact parity and reconstruction independently of Candidate A. This independent result was recorded before the A+B combination benchmark.

### Candidate C Benchmark

`bench-ruffini-constant-elision.ts` measures Candidate C independently of the division-kernel choice:

- baseline: materialize `P - c`, then run current production Ruffini division;
- candidate: run current production Ruffini division on `P`, then subtract `c` only from the scalar remainder.

Both paths use the same production division kernel, so the comparison isolates constant-polynomial materialization and remainder correction. The recorded independent result below was produced before A+B promotion; rerunning it after promotion evaluates the same C choice on top of the promoted kernel. The benchmark checks exact quotient/remainder parity and reconstructs the original `P - c` numerator.

```bash
npm run bench:ruffini:constant -- --shapes=8192x512,16384x512,128x1 --candidates=current-subtract-materialize-divide,candidate-c-remainder-adjustment --iterations=5 --warmup=1 --json=tmp/timing/ruffini-constant-elision-representative.json
```

After the independent Candidate C result, the same script also reports `candidate-abc-row-major-raw-buffer-remainder-adjustment`, which combines the accepted-for-combination A+B kernel with C. This combined row must not be used as evidence for the earlier independent Candidate C result.

```bash
npm run bench:ruffini:constant -- --shapes=8192x512,16384x512,128x1 --candidates=current-subtract-materialize-divide,candidate-abc-row-major-raw-buffer-remainder-adjustment --iterations=5 --warmup=1 --json=tmp/timing/ruffini-abc-representative.json
```

### Combination Results

`A+B` command:

```bash
npm run bench:ruffini -- --shapes=8192x512,16384x512,128x1 --candidates=current-production,candidate-ab-row-major-raw-buffer --iterations=5 --warmup=1 --json=tmp/timing/ruffini-division-ab-representative.json
```

| shape | production median | A+B median | median reduction |
| --- | ---: | ---: | ---: |
| `8192x512` | 1740.681 ms | 1432.674 ms | 17.7% |
| `16384x512` | 3714.118 ms | 2906.546 ms | 21.7% |
| `128x1` | 0.051 ms | 0.055 ms | -7.8% |
| five-call weighted estimate | 8936.214 ms | 7204.623 ms | 19.4% |

Generic `A+B+C` result:

| shape | materialize `P-c` + production median | A+B+C median | median reduction |
| --- | ---: | ---: | ---: |
| `8192x512` | 2487.744 ms | 1467.442 ms | 41.0% |
| `16384x512` | 5161.251 ms | 2936.670 ms | 43.1% |
| `128x1` | 0.080 ms | 0.055 ms | 31.3% |
| five-call generic estimate | 12624.563 ms | 7339.050 ms | 41.9% |

All combination smoke and representative cases pass exact quotient/remainder parity and independent reconstruction. A+B is the fastest verified division kernel. A+B+C is the fastest verified generic constant-correction path and removes the full corrected-numerator temporary. The generic five-call estimate retains the previously documented `Pi_A`/`Pi_C` limitation; production promotion must be followed by the full prover timing and verification gates to establish actual integrated impact.

Result:

| shape | materialize `P-c` median | adjust remainder median | median reduction | temporary bytes removed |
| --- | ---: | ---: | ---: | ---: |
| `8192x512` | 2450.399 ms | 1751.366 ms | 28.5% | 128 MiB |
| `16384x512` | 5130.673 ms | 3726.111 ms | 27.4% | 256 MiB |
| `128x1` | 0.083 ms | 0.051 ms | 38.6% | 4 KiB |
| five-call generic estimate | 12481.953 ms | 8980.260 ms | 28.1% | 640 MiB cumulative |

Candidate C passes exact quotient/remainder parity and reconstruction of `P-c`. The result proves that constant-polynomial materialization is wasteful when the surrounding path is exactly `P-c` followed by Ruffini division.

The five-call row is a generic mechanism estimate, not an integrated opening-call-site result. `M`, `N`, and `Pi_B` directly have this shape. `Pi_A` and `Pi_C` place the constant correction inside larger linear combinations, and `Pi_C` divides a larger final numerator than the `RXY-R_eval` term that supplies its correction. Their actual end-to-end gain must be measured in the later call-site combination benchmark.

## Production Promotion

Related commit: `1d18b1c5` (`Optimize Ruffini opening division`).

The promoted implementation combines A+B in `BivariatePolynomialBuffer.divByRuffini(...)` and applies C at all five opening call sites. The division kernel processes contiguous Y rows for each reverse X recurrence step, validates points once, and uses direct byte views. The opening path no longer materializes full `P-c` buffers; it divides `P` and applies the weighted constant correction only to the scalar remainder.

Standalone stage-timing comparison:

| operation | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.combination_without_multiplication` | 55.43 s | 52.78 s | -2.65 s |
| `polynomial.div_ruffini` | 9.97 s | 8.79 s | -1.18 s |
| `field.operations` | 144.26 s | 140.92 s | -3.34 s |
| prover stage total | 258.49 s | 255.44 s | -3.05 s |
| total wall | 266.36 s | 263.51 s | -2.85 s |

The full integrated gain is smaller than the generic A+B+C estimate because only part of each opening numerator is a removable constant correction, and total wall time also contains unchanged polynomial and commitment work. Production parity, native testing-mode invariants, Node proof verification, Chromium proof generation and verification, build, and package-content checks all pass.

## Whole-Loop WASM And Worker Promotion

Related commit: `f94f9942` (`Parallelize prover Ruffini division`).

The post-A+B scalar recurrence still crossed the JavaScript/WASM boundary once
per field operation. The accepted rewrite moves the complete reverse X
recurrence into a backend-owned WASM kernel, partitions independent Y columns
through ffjavascript's existing worker queue, reassembles the X quotient, and
then runs the dependent Y recurrence once. Recurrence order within a column is
unchanged. Constant-correction elision at the five opening call sites is also
unchanged.

Pre-promotion benchmark:

```bash
npm run bench:ruffini -- --shapes=8192x512,16384x512,128x1 --candidates=current-production,candidate-wasm-single-task,candidate-wasm-worker-x --iterations=3 --warmup=1 --json=tmp/timing/ruffini-wasm-representative.json
```

The command above records the names used before promotion; the current script
renames that scalar baseline to `scalar-production-baseline` and the accepted
worker path to `current-production`.

| shape | scalar JS | caller-thread WASM | worker-sharded WASM | worker reduction |
| --- | ---: | ---: | ---: | ---: |
| `8192x512` | 1428.639 ms | 334.120 ms | 122.492 ms | 91.4% |
| `16384x512` | 2881.126 ms | 694.283 ms | 244.438 ms | 91.5% |
| `128x1` | 0.056 ms | 0.019 ms | 0.052 ms | 7.1% |
| five-call weighted estimate | 7167.099 ms | 1696.662 ms | 611.965 ms | 91.5% |

Every candidate passed exact quotient/remainder parity, small edge cases, and
independent reconstruction. The diagnostic explicit-allocation upper bound for
the worker candidate is 768 MiB at `8192x512` and 1536 MiB at `16384x512`;
these are conservative sums of owned buffers, not measured process peaks.

Integrated fixed-taxonomy timing:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.div_ruffini` | 8.58 s | 0.801 s | -7.78 s (-90.7%) |
| prover stage total | 165.30 s | 156.51 s | -8.79 s |
| total wall | 172.57 s | 164.65 s | -7.92 s |

The aggregate stage comparison contains normal variation in unchanged MSM and
field work; `polynomial.div_ruffini` is the direct target. Native
testing-mode-style invariants and Node proof verification passed. Chromium
generated a 2408-byte proof in `160.48 s` and verified it in `19 ms`. Build
and package inspection also passed; the 253-file package contains no
`test/`, `scripts/`, `fixtures/`, or `tmp/` paths.

## Promotion Rule

Do not promote a candidate into production prover code from this benchmark alone. A production change must also pass the relevant operation parity check, native testing-mode-style prover diagnostics, full prover runtime verification, and package distribution checks.

## Whole-Loop WASM Vanishing Division

`bench-vanishing-division.ts` constructs exactly divisible numerators and
measures the complete optimized vanishing-division boundary, including shape
optimization, block-row extraction, task input copying, corrected numerator
assembly, column extraction, and quotient assembly.

```bash
npm run bench:vanishing -- --cases=8192x512:4096x256,16384x512:4096x256 --iterations=3 --warmup=1 --json=tmp/timing/vanishing-division-representative.json
```

Representative medians:

| numerator / vanishing degree | scalar JS | caller-thread WASM | one production worker | worker shards | worker reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| `8192x512 / 4096x256` | 1668.829 ms | 93.498 ms | 211.248 ms | 123.671 ms | 92.6% |
| `16384x512 / 4096x256` | 3216.914 ms | 174.470 ms | 268.205 ms | 233.578 ms | 92.7% |

The caller-thread result uses a diagnostics-only single-thread runtime and is
not directly available to the production multi-thread runtime. Within the
production runtime, worker shards beat one worker at both real prover shapes.
Every candidate passes exact quotient-byte parity and reconstruction on small
and representative cases. Conservative explicit-allocation bounds are 832 MiB
and 1472 MiB respectively; they are not measured process peaks.

Related commit: `72c8c379` (`Parallelize prover vanishing division`).

Production shards X-block accumulation and Y quotient recurrence by local X
rows, assembles the corrected first X block, then shards the X quotient
recurrence by independent Y columns. Recurrence order inside each row or
column remains unchanged.

Integrated fixed-taxonomy timing:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.div_vanishing` | 5.701 s | 0.940 s | -4.761 s (-83.5%) |
| prover stage total | 152.070 s | 147.400 s | -4.670 s |
| total wall | 159.890 s | 154.850 s | -5.040 s |

Polynomial parity, native testing-mode-style invariants, and Node proof
verification passed. Chromium generated a 2408-byte proof in `150.46 s` and
verified it in `19 ms`. Build and package inspection passed; the 253-file
package contains no `test/`, `scripts/`, `fixtures/`, or `tmp/` paths.

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

## Accepted Production Batched 2D NTT Segment Scheduler

Production `biNttBuffer()` now uses a batched segment scheduler for independent same-size row and column transforms. The previous implementation called ffjavascript once per row and once per column. For prover-size grids such as `4096x256`, that produced thousands of small public `Fr.fft()` / `Fr.ifft()` calls and did not benefit from ffjavascript's worker-parallel primitive scheduler.

The accepted production path keeps the 2D NTT algebra unchanged:

- each row and column remains an independent 1D transform;
- independent rows or columns are never concatenated into one large 1D FFT;
- column transforms are made contiguous through an explicit transpose, then transposed back to row-major `(x, y)` layout;
- inverse normalization and output rotation match ffjavascript's public `Fr.ifft()` behavior.

Command:

```bash
npm run bench:2d-ntt -- --shapes=1024x256,4096x256 --modes=single,parallel --directions=forward,inverse --iterations=1 --warmup=0 --json=tmp/timing/2d-ntt-segment-scheduler.json
```

The script parity-checks every candidate against production `biNttBuffer()` before timing. After production promotion it compares the old sequential implementation, the production implementation, and the benchmark-local batched implementation.

Pre-promotion benchmark result:

| mode | direction | candidate | shape | ms/op |
| --- | --- | --- | ---: | ---: |
| single | forward | current-biNttBuffer | 1024x256 | 468.413 |
| single | forward | batched-segment-biNttBuffer | 1024x256 | 443.903 |
| single | inverse | current-biNttBuffer | 1024x256 | 505.052 |
| single | inverse | batched-segment-biNttBuffer | 1024x256 | 479.064 |
| single | forward | current-biNttBuffer | 4096x256 | 2081.253 |
| single | forward | batched-segment-biNttBuffer | 4096x256 | 1961.657 |
| single | inverse | current-biNttBuffer | 4096x256 | 2254.328 |
| single | inverse | batched-segment-biNttBuffer | 4096x256 | 2100.196 |
| parallel | forward | current-biNttBuffer | 1024x256 | 750.972 |
| parallel | forward | batched-segment-biNttBuffer | 1024x256 | 94.062 |
| parallel | inverse | current-biNttBuffer | 1024x256 | 753.399 |
| parallel | inverse | batched-segment-biNttBuffer | 1024x256 | 102.221 |
| parallel | forward | current-biNttBuffer | 4096x256 | 2415.140 |
| parallel | forward | batched-segment-biNttBuffer | 4096x256 | 362.200 |
| parallel | inverse | current-biNttBuffer | 4096x256 | 2835.549 |
| parallel | inverse | batched-segment-biNttBuffer | 4096x256 | 411.732 |

Post-promotion benchmark result:

| mode | direction | candidate | shape | ms/op |
| --- | --- | --- | ---: | ---: |
| single | forward | legacy-sequential-biNttBuffer | 1024x256 | 458.463 |
| single | forward | production-biNttBuffer | 1024x256 | 455.499 |
| single | inverse | legacy-sequential-biNttBuffer | 1024x256 | 525.494 |
| single | inverse | production-biNttBuffer | 1024x256 | 480.133 |
| single | forward | legacy-sequential-biNttBuffer | 4096x256 | 2066.471 |
| single | forward | production-biNttBuffer | 4096x256 | 1971.661 |
| single | inverse | legacy-sequential-biNttBuffer | 4096x256 | 2231.297 |
| single | inverse | production-biNttBuffer | 4096x256 | 2110.126 |
| parallel | forward | legacy-sequential-biNttBuffer | 1024x256 | 701.210 |
| parallel | forward | production-biNttBuffer | 1024x256 | 91.218 |
| parallel | inverse | legacy-sequential-biNttBuffer | 1024x256 | 711.655 |
| parallel | inverse | production-biNttBuffer | 1024x256 | 94.094 |
| parallel | forward | legacy-sequential-biNttBuffer | 4096x256 | 2433.564 |
| parallel | forward | production-biNttBuffer | 4096x256 | 378.400 |
| parallel | inverse | legacy-sequential-biNttBuffer | 4096x256 | 2457.709 |
| parallel | inverse | production-biNttBuffer | 4096x256 | 421.063 |

Post-promotion full prover timing:

| row | before | after |
| --- | ---: | ---: |
| polynomial.combination_with_multiplication | 132.87 s | 68.26 s |
| field.operations | 210.11 s | 143.50 s |
| encode | 119.58 s | 119.47 s |
| prover stage total | 351.91 s | 279.63 s |
| total wall | 370.68 s | 287.48 s |

Interpretation:

- The accepted production path removes the pathological many-small-public-FFT scheduling pattern.
- The largest full-prover timing improvement appears in `polynomial.combination_with_multiplication`, which includes generic bivariate multiplication and ROU conversion work.
- The optimization does not target commitment encoding; `encode` is effectively unchanged.

Verification:

```bash
npm run typecheck
npm run typecheck:scripts
npm run polynomial:buffer:check
npm run prover:ops:polynomial
npm run prover:ops:check
npm run bench:2d-ntt -- --shapes=1024x256,4096x256 --modes=single,parallel --directions=forward,inverse --iterations=1 --warmup=0 --json=tmp/timing/2d-ntt-segment-scheduler-after-production.json
npm run prover:testing-mode:check
npm run prover:stage-timing:check
```

This optimization supersedes neither the rejected transpose-scheduled production trial nor the rule that algebraic expression rewrites require their own benchmark and diagnostics.

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

## Linear Operation Candidate Matrix

The remaining linear-operation candidates were added to the same diagnostics-only benchmark. All candidates are checked byte-for-byte against the current implementation before timing.

Candidate meanings:

- Candidate 1: flat same-shape loops over raw coefficient buffers.
- Candidate 2: prefix-shape row-offset kernel for `addScaledPrefixAssign(...)`.
- Candidate 3: unit-factor add/sub kernels that avoid factor dispatch and use `field.add(...)` or `field.sub(...)` directly.
- Candidate 4: non-unit two-pass scalar multiply-add that scales the source into a temporary buffer before adding.
- Candidate 5: same-shape linear combination initialized from the first term instead of a zero accumulator.
- Candidate 6: shape-aware linear combination dispatch using same-shape flat kernels and prefix row-offset kernels.
- Candidate 7: ffjavascript public primitive check. The current `FieldRuntime` exposes `batchApplyKeyBuffer` and `batchFromMontgomeryBuffer`, but no public batch add/sub/scale/multiply-add primitive suitable for these polynomial linear kernels.
- Candidate 8: worker/WASM batch kernels. This is not a direct production candidate from the current codebase because it requires new custom worker or WASM kernel design; it remains lower priority unless JavaScript flat kernels are insufficient after integrated prover timing.

Command:

```bash
npm run bench:prover-ops -- --groups=linear-combination --shapes=4x4,32x32,512x256,1024x256,4096x256 --iterations=1 --warmup=0 --json=tmp/timing/linear-combination-all-candidates.json
```

Representative result:

| candidate | 4x4 | 32x32 | 512x256 | 1024x256 | 4096x256 |
| --- | ---: | ---: | ---: | ---: | ---: |
| current-add | 0.031 | 0.433 | 52.832 | 106.861 | 432.404 |
| candidate1-flat-same-shape-add | 0.015 | 0.200 | 21.516 | 43.392 | 174.726 |
| candidate3-unit-specialized-add | 0.009 | 0.194 | 21.712 | 45.091 | 179.062 |
| current-sub | 0.034 | 0.544 | 66.456 | 136.894 | 544.954 |
| candidate1-flat-same-shape-sub | 0.014 | 0.331 | 32.142 | 66.367 | 273.600 |
| candidate3-unit-specialized-sub | 0.010 | 0.221 | 25.423 | 42.905 | 184.398 |
| current-scale | 0.010 | 0.224 | 27.426 | 53.208 | 228.481 |
| candidate1-flat-same-shape-scale | 0.010 | 0.231 | 25.631 | 53.315 | 220.420 |
| current-addScaledAssign | 0.027 | 0.430 | 44.652 | 88.842 | 369.712 |
| candidate1-flat-same-shape-addScaled | 0.022 | 0.402 | 42.375 | 87.557 | 355.155 |
| candidate4-non-unit-two-pass-addScaled | 0.016 | 0.425 | 47.396 | 99.015 | 400.489 |
| current-prefix-addScaledAssign | 0.009 | 0.112 | 13.162 | 29.414 | 113.229 |
| candidate2-prefix-offset-addScaled | 0.009 | 0.099 | 10.489 | 22.430 | 89.190 |
| current-linearCombinationBuffer | 0.053 | 1.331 | 158.208 | 320.907 | 1322.379 |
| candidate1-flat-same-shape-linearCombination | 0.038 | 1.206 | 129.570 | 260.689 | 1064.524 |
| candidate5-first-term-linearCombination | 0.026 | 1.024 | 110.451 | 221.727 | 930.752 |
| current-mixed-prefix-linearCombination | 0.035 | 0.956 | 119.600 | 238.404 | 993.944 |
| candidate6-shape-aware-linearCombination | 0.164 | 0.903 | 94.431 | 191.382 | 797.680 |

Interpretation:

- Candidate 2 is positive: prefix row-offset accumulation is about 1.27x faster than current prefix accumulation at `4096x256`.
- Candidate 3 is positive for subtraction: direct `field.sub(...)` avoids the `neg + add` path and is about 2.95x faster than current subtraction at `4096x256`. Direct add is similar to Candidate 1 and does not materially improve over it.
- Candidate 4 is rejected: the temporary scaled-source buffer is slower than the current path at prover-scale shapes.
- Candidate 5 is positive: first-term accumulator construction is about 1.42x faster than current same-shape `linearCombinationBuffer` at `4096x256`.
- Candidate 6 is positive for mixed full-shape plus prefix terms: shape-aware dispatch is about 1.25x faster than the current mixed-prefix linear combination at `4096x256`.

Production direction:

- Prefer a single production rewrite that combines Candidate 2, Candidate 3 subtraction, Candidate 5, and Candidate 6 under one shape-aware linear-combination implementation.
- Do not promote Candidate 4.
- Do not add a custom worker/WASM kernel for this path unless integrated prover timing shows the JavaScript flat-buffer rewrite is insufficient.

## Accepted Shape-Aware Linear Operation Rewrite

The successful linear-operation candidates were promoted together:

- Same-shape flat accumulation for full-size add/sub/addScaled paths.
- Prefix row-offset accumulation for prefix-contained terms.
- Direct subtraction for `-1` factors.
- First nonzero term accumulator construction in `linearCombinationBuffer(...)`.
- Shape-aware dispatch through the optimized accumulation kernels.

Candidate 4 was not promoted. Candidate 8 remains a deferred research item only.

Verification:

```bash
npm run typecheck
npm run typecheck:scripts
npm run polynomial:buffer:check
npm run prover:ops:polynomial
npm run prover:ops:check
npm run prover:testing-mode:check
npm run prover:stage-timing:check
npm run bench:prover-ops -- --groups=linear-combination --shapes=4x4,32x32,512x256,1024x256,4096x256 --iterations=1 --warmup=0 --json=tmp/timing/linear-combination-after-production.json
```

Representative `4096x256` before/after comparison:

| path | before | after | speedup | reduction |
| --- | ---: | ---: | ---: | ---: |
| current-add | 432.404 | 349.267 | 1.24x | 19.2% |
| current-sub | 544.954 | 346.478 | 1.57x | 36.4% |
| current-addScaledAssign | 369.712 | 353.012 | 1.05x | 4.5% |
| current-prefix-addScaledAssign | 113.229 | 90.786 | 1.25x | 19.8% |
| current-linearCombinationBuffer | 1322.379 | 918.179 | 1.44x | 30.6% |
| current-mixed-prefix-linearCombination | 993.944 | 656.714 | 1.51x | 33.9% |

Integrated stage timing after the rewrite:

| category or event group | before | after |
| --- | ---: | ---: |
| stage total | 355.70 s | 344.27 s |
| poly total | 213.94 s | 200.66 s |
| poly_detail total | 284.37 s | 258.09 s |
| poly.combine | 196.46 s | 182.45 s |
| poly.linear/add | 118.04 s | 74.55 s |

The stage-timing totals are diagnostic spans and may overlap. Use them for hotspot ranking and before/after direction, not additive wall-time accounting.

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

### Adjusted-Point Evaluation Candidate

For a bivariate polynomial `P(X,Y)`, coefficient scaling by `a^i` in the X coefficient direction satisfies `scaleCoeffsX(a)(P)(x,y) = P(a*x,y)`. Similarly, coefficient scaling by `b^j` in the Y coefficient direction satisfies `scaleCoeffsY(b)(P)(x,y) = P(x,b*y)`. Therefore, scaled-polynomial materialization can be avoided when the scaled polynomial is needed only for evaluation.

This benchmark compares current-style scaled-polynomial materialization plus evaluation against direct evaluation at adjusted points. It is diagnostics-only and does not change production prover code.

The evaluation group also contains benchmark-only candidates for the next evaluation optimization phase:

- `raw-buffer-horner-eval`: scans the coefficient buffer by byte offset instead of calling `getCoeff()` for every coefficient.
- `power-table-eval`: precomputes X/Y powers and evaluates by coefficient dot products.
- `shared-row-adjusted-prove3-like-set`: evaluates the prove3-style three-point set while sharing row reductions for the two points with the same Y coordinate.
- `derived-rd-difference-evals`: derives `rD1`/`rD2` evaluation values from base and adjusted-point evaluations instead of evaluating materialized difference polynomials.
- `lagrange-k0-direct-formula-eval`: evaluates the structured `L_0(X)` basis polynomial by formula instead of materializing and scanning the polynomial.

These candidates are diagnostics-only. They are implemented for parity and future timing runs; they are not production changes and must not be promoted without representative benchmark results and prover acceptance checks.

Command:

```bash
npm run bench:prover-ops -- --groups=evaluation --shapes=4096x256,8192x512 --iterations=1 --warmup=0 --json=tmp/timing/evaluation-adjusted-point-representative.json
```

Representative result:

| group | candidate | shape | ms/op | speedup versus current |
| --- | --- | ---: | ---: | ---: |
| evaluation | current-scale-x-then-eval | 4096x256 | 587.169 | - |
| evaluation | adjusted-point-x-eval | 4096x256 | 336.211 | 1.75x |
| evaluation | current-scale-y-then-eval | 4096x256 | 598.810 | - |
| evaluation | adjusted-point-y-eval | 4096x256 | 342.664 | 1.75x |
| evaluation | current-scale-xy-then-eval | 4096x256 | 837.558 | - |
| evaluation | adjusted-point-xy-eval | 4096x256 | 349.626 | 2.40x |
| evaluation | current-prove3-like-scaled-set | 4096x256 | 1524.671 | - |
| evaluation | adjusted-point-prove3-like-set | 4096x256 | 1081.993 | 1.41x |
| evaluation | current-scale-x-then-eval | 8192x512 | 2328.985 | - |
| evaluation | adjusted-point-x-eval | 8192x512 | 1396.252 | 1.67x |
| evaluation | current-scale-y-then-eval | 8192x512 | 2315.450 | - |
| evaluation | adjusted-point-y-eval | 8192x512 | 1390.405 | 1.67x |
| evaluation | current-scale-xy-then-eval | 8192x512 | 3261.847 | - |
| evaluation | adjusted-point-xy-eval | 8192x512 | 1399.149 | 2.33x |
| evaluation | current-prove3-like-scaled-set | 8192x512 | 6111.938 | - |
| evaluation | adjusted-point-prove3-like-set | 8192x512 | 4220.614 | 1.45x |

Follow-up candidate benchmark:

```bash
npm run bench:prover-ops -- --groups=evaluation --shapes=16x16 --iterations=1 --warmup=0 --json=tmp/timing/evaluation-candidates-smoke.json
npm run bench:prover-ops -- --groups=evaluation --shapes=4096x256,8192x512 --iterations=1 --warmup=0 --json=tmp/timing/evaluation-candidates-representative.json
```

Representative follow-up result:

| candidate | 4096x256 ms/op | 8192x512 ms/op | interpretation |
| --- | ---: | ---: | --- |
| current-single-horner-eval | 335.025 | 1365.711 | Baseline single full-grid Horner evaluation. |
| raw-buffer-horner-eval | 330.519 | 1607.586 | No representative gain; do not promote. |
| power-table-eval | 334.264 | 1598.930 | No representative gain; do not promote. |
| adjusted-point-prove3-like-set | 1014.815 | 4114.674 | Current adjusted-point repeated-evaluation baseline. |
| shared-row-adjusted-prove3-like-set | 665.154 | 2596.415 | Strong candidate for production review when the same polynomial is evaluated at two points sharing the same Y challenge. |
| current-rd-difference-evals | 1883.731 | 7430.791 | Current-style materialized difference-polynomial evaluation model. |
| derived-rd-difference-evals | 764.723 | 2601.670 | Strong candidate for production review if the actual opening equations can reuse already computed adjusted-point values. |
| lagrange-k0-polynomial-eval | 2.317 | 5.005 | Baseline materialized structured-polynomial evaluation. |
| lagrange-k0-direct-formula-eval | 0.063 | 0.137 | Strong micro-candidate, but only meaningful where the Lagrange value is needed without requiring the materialized polynomial object. |

The smoke run also passed parity checks for all follow-up candidates at `16x16`. The representative run passed parity checks for `4096x256` and `8192x512`.

Production call-site review:

| candidate | production call site | review result |
| --- | --- | --- |
| `shared-row-adjusted-prove3-like-set` | `src/prover/internal/challenge-evaluations.ts`, where `RXY` is evaluated at `(chi,zeta)`, `(omegaMI^-1 * chi,zeta)`, and `(omegaMI^-1 * chi,omegaSMax^-1 * zeta)` | Applicable. The first two evaluations share the same Y point, so a helper can share the row Horner reductions for those two values while preserving the third adjusted-Y evaluation. |
| `shared-row-adjusted-prove3-like-set` | `src/prover/internal/opening-commitments.ts`, where `rXY`, `rOmegaX`, and `rOmegaXOmegaY` evaluation values are needed | Applicable to the evaluation values only. The materialized `rOmegaX` and `rOmegaXOmegaY` polynomial objects are still needed to construct `rD1`, `rD2`, and later polynomial terms. |
| `derived-rd-difference-evals` | `src/prover/internal/opening-commitments.ts`, where `rD1Eval = rD1(chi,zeta)` and `rD2Eval = rD2(chi,zeta)` | Applicable after the adjusted `rXY` evaluations are available. Since `rD1 = rXY - rOmegaX`, `rD1Eval = rXY(chi,zeta) - rXY(omegaMI^-1 * chi,zeta)`. Since `rD2 = rXY - rOmegaXOmegaY`, `rD2Eval = rXY(chi,zeta) - rXY(omegaMI^-1 * chi,omegaSMax^-1 * zeta)`. The `rD1` and `rD2` polynomial objects are still needed for `mulByTerm9(...)`. |
| `lagrange-k0-direct-formula-eval` | `src/prover/internal/opening-commitments.ts`, where `lagrangeK0Eval` is used as a scalar and `lagrangeK0XY` is also multiplied by `rD2Term9PlusTerm10` | Applicable to `lagrangeK0Eval` only. The materialized `lagrangeK0XY` polynomial object is still required for `lagrangeK0XY.mul(...)`. The value can use `L_0(chi) = (chi^mI - 1) / (mI * (chi - 1))`, with the explicit `chi = 1` branch. |
| `raw-buffer-horner-eval` | General `BivariatePolynomialBuffer.eval(...)` replacement candidate | Not applicable for promotion. It is not consistently faster at representative size. |
| `power-table-eval` | General `BivariatePolynomialBuffer.eval(...)` replacement candidate | Not applicable for promotion. It is slower at representative size and increases temporary state. |

Promotion guidance:

- A production rewrite may introduce a small internal multi-point evaluation helper if it stays under `src/prover/internal/`, has no artifact validation behavior, and is used only by prover hot paths that already own trusted binary runtime objects.
- The timing mirror in `scripts/check/prover/check-prover-stage-timing.ts` must be updated in the same change if production evaluation call sites are rewritten.
- Production promotion must run prover acceptance checks and update [`docs/optimization/prover-optimization-history.md`](../../../docs/optimization/prover-optimization-history.md) with before/after stage timing because the change is optimization-motivated.

Interpretation:

- The candidate is directly applicable to evaluation-only scaled-polynomial paths such as the challenge-evaluation responsibility where `R_omegaX` and `R_omegaX_omegaY` are only evaluated.
- The candidate should not be blindly applied to paths that also need the scaled polynomial object for later polynomial arithmetic. In those cases the materialized scaled polynomial may still be required.
- Production promotion has been accepted for challenge evaluation only. Opening-commitment scaled-polynomial paths remain unchanged because they reuse the scaled polynomial objects in later arithmetic.

## Whole-Loop WASM Polynomial Evaluation

`bench-polynomial-evaluation.ts` measures the complete caller boundary for
single-point and fused base/scaled-X/scaled-XY Horner evaluation. It compares
the retained scalar JavaScript implementation, one caller-thread WASM task,
and row-sharded worker execution followed by one ordered X reduction.

Pre-promotion command:

```bash
npm run bench:evaluation -- --shapes=4096x256,8192x512,16384x512 --iterations=3 --warmup=1 --json=tmp/timing/polynomial-evaluation-representative.json
```

Representative medians:

| workload | shape | scalar JS | caller-thread WASM | row workers | worker reduction |
| --- | --- | ---: | ---: | ---: | ---: |
| single | `4096x256` | 334.796 ms | 76.588 ms | 15.496 ms | 95.4% |
| single | `8192x512` | 1330.758 ms | 310.753 ms | 55.205 ms | 95.9% |
| single | `16384x512` | 2702.805 ms | 623.114 ms | 105.439 ms | 96.1% |
| fused | `4096x256` | 642.013 ms | 150.808 ms | 26.977 ms | 95.8% |
| fused | `8192x512` | 2550.235 ms | 606.148 ms | 93.428 ms | 96.3% |
| fused | `16384x512` | 5170.854 ms | 1229.728 ms | 173.258 ms | 96.6% |

The benchmark includes polynomial-buffer copying into ffjavascript tasks,
worker result assembly, and final X reduction. All candidates pass exact field
parity at edge and representative shapes. After promotion, the script names
the worker implementation `current-production`, retains the old paths as
`scalar-js-baseline` and `wasm-single-task`, and keeps an independent
`worker-kernel-mirror`.

Related commit: `19e46791` (`Parallelize prover polynomial evaluation`).

Production adds `evalBatch(...)` and a fused scaled-challenge batch helper.
Workers reduce independent coefficient rows at the requested Y points; one
ordered WASM Horner recurrence then combines the rows in X. Adjusted-point
formulas remain unchanged and no scaled polynomial is materialized.

Integrated fixed-taxonomy timing:

| row | before | after | delta |
| --- | ---: | ---: | ---: |
| `polynomial.evaluation` | 5.272 s | 0.228 s | -5.044 s (-95.7%) |
| prover stage total | 156.511 s | 152.070 s | -4.441 s |
| total wall | 164.651 s | 159.890 s | -4.761 s |

Operation parity, native testing-mode-style invariants, and Node proof
verification passed. Chromium generated a 2408-byte proof in `155.02 s` and
verified it in `20 ms`. Build and package inspection passed; the 253-file
package contains no `test/`, `scripts/`, `fixtures/`, or `tmp/` paths.

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

## Same-Shape Add/Sub Construction

Production commit `9edb6876` changes `BivariatePolynomialBuffer.add(...)` and
`sub(...)` so equal-shape inputs construct their output in one coefficient
traversal. Mixed-shape operations retain the previous prefix-accumulation
path.

Post-promotion representative timing:

| operation | `4096x256` | `8192x512` |
| --- | ---: | ---: |
| production add | 190.550 ms | 876.130 ms |
| production sub | 190.058 ms | 872.330 ms |

Across the stable integrated add/sub call-site set, accumulated time decreased
from `10.790 s` to `8.917 s`, a `1.873 s` (`17.4%`) reduction. The full timing
run had unrelated multiplication and encode increases, so its total wall-time
regression is not attributed to this rewrite. Exact polynomial parity,
testing-mode invariants, generated-proof verification, build, Chromium proof
generation and verification, and package-content inspection passed.

## Zero-Buffer Initialization

Production commit `217becb8` makes the all-zero ffjavascript field
representation an explicit `FieldRuntime` invariant and removes the redundant
element-by-element writes from `createZeroBuffer(...)`. Field-buffer parity
checks cover the raw representation. Full-prover timing remained within
run-to-run variation (`258.28 s` before and `258.94 s` after), while all Node,
Chromium, build, and package-content gates passed.

## Opening pC Term Fusion

The diagnostics-only `bench-opening-pc-fusion.ts` compares the complete
opening `pC` construction with and without materialized `term5` and `term6`
polynomials. Both paths include scalar preparation, allocation, arithmetic,
mixed input shapes, and final output construction.

```bash
npm run bench:opening-pc-fusion -- --base-shape=16x16 --iterations=2 --warmup=1 --json=tmp/timing/opening-pc-fusion-smoke.json
npm run bench:opening-pc-fusion -- --base-shape=4096x256 --iterations=1 --warmup=0 --json=tmp/timing/opening-pc-fusion-representative.json
```

| candidate | base shape | output shape | ms/op |
| --- | ---: | ---: | ---: |
| current materialized `term5`/`term6` | `4096x256` | `8192x512` | 5477.132 |
| fused `pC` | `4096x256` | `8192x512` | 4156.551 |

The fused equation passed exact output-buffer parity and reduced representative
time by `1320.581 ms` (`24.1%`).

Production commit `3930b3f0` applies the fused equation. The integrated target
decreased from `7.043 s` for `term5 + term6 + pC` to `5.510 s` for fused `pC`,
a `1.533 s` (`21.8%`) reduction. Total wall time decreased from `258.94 s` to
`256.76 s`. Node and Chromium proof generation and verification, testing-mode
invariants, build, and package-content inspection passed.

## Copy Linear-Term Fusion

`bench-copy-linear-fusion.ts` compares the current
`linearFactor(rD) + rR*gD` materialization sequence with a single output
kernel. It checks X/Y axes, zero/unit/non-unit scales, and complete term2 and
Lagrange-K0 term3 paths.

| path | current | fused | reduction |
| --- | ---: | ---: | ---: |
| term2 X | 1619.411 ms | 1435.486 ms | 11.4% |
| term2 Y | 1692.354 ms | 1315.259 ms | 22.3% |
| term3 X | 2426.903 ms | 1886.317 ms | 22.3% |
| term3 Y | 3034.606 ms | 2553.877 ms | 15.8% |
| four-path total | 8773.274 ms | 7190.939 ms | 18.0% |

All output buffers passed exact parity at smoke and representative
`4096x256` input shape.

Production commit `ec31e7dd` applies dedicated X/Y fused helpers to the four
copy-quotient call sites. `field.operations` decreased from `115.56 s` to
`113.67 s`, total wall decreased from `256.76 s` to `255.25 s`, and Chromium
proof generation completed in `241.44 s`.

## N-Term Linear Combination

Candidate 22C tests a coefficient-oriented kernel that traverses all active
terms for each output coefficient and writes that coefficient once. The
current implementation instead accumulates one term at a time. Both paths
include scalar dispatch, allocation, arithmetic, mixed-shape bounds checks,
and output construction.

```bash
npm run bench:prover-ops -- --groups=linear-combination --shapes=4096x256,8192x512 --iterations=1 --warmup=0 --json=tmp/timing/nterm-linear-combination-representative.json
```

| workload | shape | current | coefficient-oriented | candidate change |
| --- | ---: | ---: | ---: | ---: |
| three full-shape terms | `4096x256` | 1041.922 ms | 1117.061 ms | +7.2% |
| two full-shape terms plus prefix | `4096x256` | 744.508 ms | 991.750 ms | +33.2% |
| five full-shape terms | `4096x256` | 1425.707 ms | 1470.801 ms | +3.2% |
| three full-shape terms | `8192x512` | 4027.813 ms | 4357.717 ms | +8.2% |
| two full-shape terms plus prefix | `8192x512` | 2865.006 ms | 3254.124 ms | +13.6% |
| five full-shape terms | `8192x512` | 5552.795 ms | 5662.926 ms | +2.0% |

All candidate outputs passed exact byte parity. The candidate is rejected:
reduced accumulator writes do not offset the per-coefficient term loop,
mixed-shape bounds checks, and scalar dispatch. Production remains on the
term-oriented accumulator.

## Cross-Stage Polynomial Retention

Candidate 22D tested two independent production-path experiments. Each
experiment used the prepared full proof fixture, generated a proof accepted by
the verifier, and recorded process maximum RSS with `/usr/bin/time -l`.
Experimental source changes were reverted after measurement.

| candidate | explicit retained bytes | removed repeated work | full wall | maximum RSS |
| --- | ---: | ---: | ---: | ---: |
| current baseline | 0 | 0 | 251.21 s | 12.391 GB |
| retain `fXY` from recursion through opening, run 1 | about 32 MiB | two linear combinations, 1.812 s accumulated | 251.11 s | 13.616 GB |
| retain `fXY` from recursion through opening, run 2 | about 32 MiB | two linear combinations, 1.812 s accumulated | 251.95 s | 12.890 GB |
| retain both shifted-r polynomials from copy through opening | about 64 MiB | two coefficient rescale traversals, about 0.591 s accumulated | 252.48 s | 13.386 GB |

The fixed-taxonomy `fXY` experiment reduced `field.operations` from
`113.675 s` to `112.213 s`, but its full wall time did not improve
repeatably. Both retention variants also raised observed maximum RSS. Neither
candidate passes the campaign requirement for a repeatable full-prover
improvement that justifies its longer-lived buffers. Production continues to
recompute these derived polynomials at their use sites.

## Coefficient Rescale Access

`bench-coefficient-rescale.ts` compares complete output construction for the
current validated read/write loops, validated-once direct subarray loops, and
supported public ffjavascript batch-key operations.

```bash
npm run bench:coefficient-rescale -- --shape=4096x256 --iterations=2 --warmup=1 --json=tmp/timing/coefficient-rescale-4096x256.json
npm run bench:coefficient-rescale -- --shape=8192x512 --iterations=2 --warmup=1 --json=tmp/timing/coefficient-rescale-8192x512.json
```

| operation | candidate | `4096x256` | `8192x512` |
| --- | --- | ---: | ---: |
| uniform scale | current read/write | 241.018 ms | 958.383 ms |
| uniform scale | direct subarray | 229.631 ms | 902.081 ms |
| uniform scale | public batch key | 25.897 ms | 93.484 ms |
| X coefficient rescale | current read/write | 259.422 ms | 973.058 ms |
| X coefficient rescale | direct subarray | 228.441 ms | 894.262 ms |
| Y coefficient rescale | current read/write | 245.828 ms | 972.202 ms |
| Y coefficient rescale | direct subarray | 229.111 ms | 912.387 ms |
| Y coefficient rescale | public batch key with root cycle | 26.669 ms | 97.400 ms |

All candidates pass exact byte parity. The Y batch candidate is valid only
when the increment has order dividing `ySize`; then its powers restart at each
row in the row-major coefficient buffer. This holds for the prover's
`omegaSMax^-1` rescale. It is not a generic replacement for arbitrary Y
factors. No corresponding single batch-key sequence represents X rescaling.

Production commit `9f35558c` applies direct subarray access to the three
existing synchronous methods. It uses public batch-key scaling only for the
copy/opening `omegaSMax^-1` Y rescale and opening `term10`.

| integrated target | before | after | delta |
| --- | ---: | ---: | ---: |
| two Y root-cycle rescale events | 0.598 s | 0.247 s | -0.351 s |
| opening `term10` scale | 0.269 s | 0.028 s | -0.241 s |
| `field.operations` | 113.675 s | 111.487 s | -2.188 s |
| prover stage total | 247.264 s | 245.206 s | -2.057 s |
| total wall | 255.249 s | 253.738 s | -1.511 s |

Chromium generated the proof in `236.67 s` and verified it in `19 ms`.
Type checks, polynomial parity, testing-mode invariants, stage timing and
generated-proof verification, build, and package-content inspection passed.

## Whole-Chunk WASM Linear Operations

`bench-linear-wasm-batches.ts` compares the existing coefficient-by-coefficient
JavaScript loops with backend-owned WASM module-plugin kernels. It does not
fork or modify ffjavascript, wasmcurves, or wasmbuilder. Every candidate
includes chunk slicing, worker dispatch, WASM execution, result collection,
and output assembly, and every measured output must pass exact byte parity.

```bash
npm run bench:linear-wasm -- --shape=4096x256 --prefix-shape=4096x128 --iterations=3 --warmup=1 --workers=1,2,4,8,14 --json=tmp/timing/linear-wasm-4096x256.json
npm run bench:linear-wasm -- --shape=8192x512 --prefix-shape=8192x256 --iterations=2 --warmup=1 --workers=4,8,14 --json=tmp/timing/linear-wasm-8192x512.json
```

Representative 14-worker results:

| operation | `4096x256` current | `4096x256` batch | speedup | `8192x512` current | `8192x512` batch | speedup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| add | 232.192 ms | 16.101 ms | 14.42x | 924.583 ms | 66.257 ms | 13.95x |
| subtract | 225.077 ms | 15.389 ms | 14.63x | 912.906 ms | 56.236 ms | 16.23x |
| uniform scale | 273.597 ms | 28.303 ms | 9.67x | 1043.031 ms | 110.671 ms | 9.42x |
| fused add-scaled | 472.667 ms | 25.792 ms | 18.33x | 1846.801 ms | 101.101 ms | 18.27x |
| prefix add-scaled | 237.640 ms | 15.403 ms | 15.43x | 917.290 ms | 68.997 ms | 13.29x |
| X coefficient scale | 270.657 ms | 16.360 ms | 16.54x | 1025.818 ms | 74.264 ms | 13.81x |
| Y coefficient scale | 506.341 ms | 27.984 ms | 18.09x | 1940.833 ms | 107.243 ms | 18.10x |

The fused add-scaled kernel also beat the two-pass
`batchApplyKey + batchAdd` composition at both representative shapes, so the
two-pass candidate was rejected. Production uses the existing public
`batchApplyKey` for uniform scaling and backend-owned module-plugin kernels
for add, subtract, fused add-scaled, strided prefix add-scaled, and
layout-aware X/Y scaling.

## Recursion Recurrence Execution Boundary

`bench-recursion-recurrence.ts` holds the accepted batch inversion outside the
measured boundary and compares only recurrence construction. The baseline
performs two scalar ffjavascript multiplications per recurrence step from
JavaScript. The candidate preserves the same dependent order in one
backend-owned WASM task; it does not claim parallelism across the dependency
chain.

```bash
npm run bench:recursion-recurrence -- --m-i=4096 --s-max=256 --iterations=3 --warmup=1 --json=tmp/timing/recursion-recurrence.json
```

| candidate | median | min | max |
| --- | ---: | ---: | ---: |
| JavaScript after batch inversion | 455.413 ms | 451.528 ms | 496.436 ms |
| one-worker WASM after batch inversion | 212.279 ms | 207.081 ms | 217.814 ms |

The WASM boundary reduced the measured recurrence by `243.134 ms` (`53.4%`)
with exact output bytes. Production commit `35bef9cc` applies that boundary.
The subsequent complete prover run did not establish an aggregate speedup:
`polynomial.recursion` changed from `1.78 s` to `1.87 s`, prover stage total
from `147.40 s` to `147.92 s`, and total wall from `154.85 s` to `155.67 s`.
Those aggregate deltas are smaller than run-to-run variation and include the
unchanged batch-inversion and NTT work.

## Whole-Loop WASM Lagrange K0 Recurrence

The Priority 24G K0 extension corrects the benchmark's `current-production`
label to the previously promoted JavaScript sliding recurrence and retains the
older generic FFT implementation under a legacy label. The new candidates
move only the sliding recurrence into WASM. Worker execution partitions
independent Y columns, compacts each shard, reassembles row-major output, and
then uses the existing primitive-parallel whole-output scaling pass.

| shape | JavaScript production | caller WASM | one worker | Y-sharded workers |
| --- | ---: | ---: | ---: | ---: |
| `4096x8192x512` | 1691.572 ms | 1210.145 ms | 304.860 ms | 268.403 ms |
| `4096x8192x256` | 852.841 ms | 624.194 ms | 146.298 ms | 143.962 ms |
| `4096x4096x512` | 866.008 ms | 622.909 ms | 161.310 ms | 136.642 ms |
| four-call weighted total | 5101.993 ms | 3667.393 ms | 917.328 ms | 817.410 ms |

The selected worker path reduced the weighted complete K0 boundary by
`84.0%`. At the largest shape its explicit algorithm-owned temporary bound is
approximately `640 MiB`, versus `256 MiB` for the JavaScript recurrence. This
uses compact column shards rather than a full input copy per worker.

Production commit `49448d7c` promotes this path. Integrated
`polynomial.combination_with_multiplication` decreased from `27.54 s` to
`23.38 s`, prover stage total from `147.92 s` to `143.76 s`, and total wall
from `155.67 s` to `151.46 s`. Chromium generated a 2408-byte proof in
`146.82 s` and verified it in `18 ms`.

## Whole-Loop WASM Lagrange KL Recurrences

The KL extension preserves direct KL construction, the accepted weighted
sliding formulas, and final batch scaling. It moves the X recurrence into
WASM and partitions independent Y columns, then moves the Y recurrence into
WASM and partitions independent X rows. Compact input shards, intermediate
assembly, row shards, final output assembly, and scaling are inside the
measured boundary.

| boundary at `4096x256` | JavaScript production | caller WASM | one worker | workers |
| --- | ---: | ---: | ---: | ---: |
| KL multiplication | 2425.599 ms | 1156.151 ms | 683.929 ms | 198.416 ms |
| KL construction plus multiplication | 2621.620 ms | 1365.213 ms | 906.783 ms | 401.267 ms |

The selected worker recurrence reduced multiplication by `91.8%`. Its
explicit algorithm-owned temporary bound is approximately `480 MiB`, compared
with `192 MiB` for the JavaScript recurrence. The increase consists of compact
X shards, the assembled intermediate, contiguous Y row shards, and assembled
output; no worker receives the full source polynomial.

Production commit `f28a5c7a` promotes this path. Integrated
`polynomial.combination_with_multiplication` decreased from `23.38 s` to
`21.71 s`, prover stage total from `143.76 s` to `141.18 s`, and total wall
from `151.46 s` to `148.72 s`. Chromium generated a 2408-byte proof in
`144.49 s` and verified it in `19 ms`.

## Whole-Loop WASM Special-Form Products

The Priority 24G special-form extension compares the retained JavaScript
implementations with caller-thread WASM, one production worker, and
X-row-sharded workers. The measured boundary includes compact source-row
copies, worker transfer, output transfer, and row-major output assembly.
Every candidate passed exact byte parity for zero, sparse, edge, and
representative inputs.

| operation at `4096x256` | JavaScript production | caller WASM | one worker | workers |
| --- | ---: | ---: | ---: | ---: |
| `(X-1)P` | 169.322 ms | 10.027 ms | 17.961 ms | 9.784 ms |
| `(1-X)P` | 170.662 ms | 10.425 ms | 18.025 ms | 8.337 ms |
| X-linear product | 545.703 ms | 158.164 ms | 163.244 ms | 27.081 ms |
| Y-linear product | 552.593 ms | 159.696 ms | 168.202 ms | 28.146 ms |
| term9 product | 887.635 ms | 244.078 ms | 253.412 ms | 38.896 ms |

Production commit `8fa5174d` promotes the worker kernels. The runtime shards
only the active X-row range and includes the immediately preceding source row
when an X-shifted term needs it; it does not copy the complete polynomial to
every worker.

Integrated `polynomial.combination_with_multiplication` decreased from
`21.71 s` to `17.91 s`, prover stage total from `141.18 s` to `137.89 s`, and
total wall from `148.72 s` to `145.26 s`. Chromium generated a 2408-byte proof
in `141.14 s` and verified it in `19 ms`.

## Whole-Loop WASM Fused Linear-Plus-Scaled Terms

`bench-copy-linear-fusion.ts` compares the current two-boundary construction
`linearFactor(rD) + scale*gD` with a JavaScript fused loop, caller-thread
WASM, one production worker, and X-row-sharded workers. The benchmark checks
the fused inner result and the complete `(X-1)` term2 and Lagrange-K0 term3
consumers. Zero, unit, and non-unit addend scales pass exact byte parity.

| boundary at `4096x256` | current production | JavaScript fused | caller WASM | one worker | workers |
| --- | ---: | ---: | ---: | ---: | ---: |
| X inner | 754.556 ms | 925.724 ms | 239.414 ms | 252.929 ms | 40.309 ms |
| X term2 | 830.353 ms | 1000.764 ms | 316.310 ms | 330.689 ms | 117.073 ms |
| X term3 | 915.441 ms | 1089.552 ms | 407.537 ms | 416.774 ms | 205.370 ms |
| Y inner | 762.490 ms | 938.908 ms | 242.006 ms | 256.952 ms | 40.763 ms |
| Y term2 | 896.942 ms | 1061.334 ms | 366.318 ms | 378.837 ms | 172.301 ms |
| Y term3 | 1017.897 ms | 1189.820 ms | 508.863 ms | 516.720 ms | 305.647 ms |

Production commit `a3773077` promotes only the fused inner kernel; existing
term2 and K0 term3 consumers remain separate optimized operations. Integrated
`polynomial.combination_without_multiplication` decreased from `8.73 s` to
`5.40 s`, prover stage total from `137.89 s` to `134.99 s`, and total wall
from `145.26 s` to `143.06 s`. Chromium generated a 2408-byte proof in
`137.57 s` and verified it in `18 ms`.

## Combined Final Openings

`bench-combined-final-openings.ts` constructs the actual prepared-fixture
opening numerators after running the prover through challenge evaluation. It
compares the current split `Pi_A`, `Pi_C`, and `Pi_B` Ruffini divisions and
commitments against one linear-combined numerator, one Ruffini division, and
the final two `Pi_X` and `Pi_Y` commitments. Fixture preparation and numerator
construction are outside the repeated boundary.

The benchmark checks exact X/Y quotient bytes and final G1 equality before
reporting timing. Two measured iterations produced:

| candidate | median | min | max | division | encode | explicit polynomial bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| current split openings | 30294.432 ms | 30103.243 ms | 30294.432 ms | 688.726 ms | 29439.615 ms | 640.051 MiB |
| combined final openings | 20317.743 ms | 20036.751 ms | 20317.743 ms | 314.218 ms | 19838.418 ms | 512.016 MiB |

The combined path reduced the isolated complete boundary by `9976.689 ms`
(`32.9%`) and reduced explicitly retained polynomial storage by approximately
`128 MiB`. This is the independent benchmark evidence that preceded the
coordinated production promotion described below.

## Shared M/N X Opening

`bench-shared-mn-opening.ts` uses the prepared fixture's real blinded
`R(X,Y)` opening polynomial. The current path computes the same X-axis
Ruffini quotient and commitment independently for `M` and `N`. The candidate
computes the shared X quotient and commitment once while retaining the two
different Y-axis divisions and commitments.

The benchmark checks that current `M_X` and `N_X` coefficient buffers are
byte-identical, then checks every candidate quotient buffer and all four G1
commitments against the current path. Two measured iterations produced:

| candidate | median | min | max | X division | Y division | encode | explicit polynomial bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current independent M/N | 10546.003 ms | 10529.465 ms | 10546.003 ms | 284.238 ms | 0.352 ms | 10261.389 ms | 256.031 MiB |
| shared X quotient/commitment | 5290.750 ms | 5281.985 ms | 5290.750 ms | 129.684 ms | 0.425 ms | 5160.625 ms | 128.031 MiB |

Sharing the X work reduced the isolated boundary by `5255.253 ms` (`49.8%`)
and explicit quotient storage by approximately `128 MiB`. This is the
independent benchmark evidence that preceded the coordinated production
promotion.

## Combined Opening Winners

`bench-opening-winners-combined.ts` measures the Priority 32B combined final
Pi opening and Priority 32C shared M/N X opening in the same complete opening
boundary. Two alternating-order iterations produced:

| candidate | median | min | max | Pi | M/N | explicit polynomial MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| current all openings | 40636.122 ms | 40619.648 ms | 40636.122 ms | 30155.639 ms | 10480.478 ms | 896.082 |
| combined Pi + shared M/N | 25531.853 ms | 25369.920 ms | 25531.853 ms | 20325.928 ms | 5205.922 ms | 640.047 |

All Pi and M/N quotient buffers and G1 commitments match exactly. The directly
measured combination reduces this boundary by `15104.269 ms` (`37.2%`) and
explicit polynomial storage by `256.035 MiB`. This measured result supersedes
any estimate formed by adding the two isolated benchmark deltas.

The coordinated implementation is now the production opening path. The
production function is directly compared against the legacy path during the
first benchmark iteration. All six final G1 commitments match. A
post-promotion run measured:

| candidate | median | Pi | M/N | explicit polynomial MiB |
| --- | ---: | ---: | ---: | ---: |
| legacy all openings | 40132.677 ms | 29724.346 ms | 10408.327 ms | 896.082 |
| production combined/shared | 24874.299 ms | 19688.843 ms | 5185.451 ms | 640.047 |

Production commits only the final combined Pi X/Y quotients. M and N share
one X quotient and commitment while retaining separate Y quotients and both
serialized M_X and N_X proof fields. Removed Pi_A/Pi_C/Pi_B split commitments
remain diagnostics-only benchmark values.

The fixed-taxonomy full run changed from `135.92 s` to `121.47 s`, with the
opening module changing from `42.98 s` to `28.21 s`. Chromium generated the
proof in `122.79 s` and verified it in `19 ms`.

## Prover CRS In-Memory Representation

`bench-crs-representation.ts` loads the real approximately `990 MiB`
`prover-crs.v1` fixture under `--expose-gc`. It compares the legacy
`10,815,983` retained per-point `Uint8Array` views with the production
seven-descriptor representation. It validates every section digest and
sampled boundary/random point bytes before reporting measurements.

| candidate | construction | 100k random accesses | 262144-point range copy | retained objects | heap delta | RSS delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| legacy per-point views | 874.843 ms | 23.907 ms | 3.277 ms | 10,815,983 | 1155.280 MiB | 1227.500 MiB |
| production raw descriptors | 0.209 ms | 10.484 ms | 0.005 ms | 7 | 0.263 MiB | 0.141 MiB |

The descriptor representation removes approximately `1.24 GiB` of persistent
JavaScript heap without changing the binary artifact layout. On-demand point
views did not regress the measured random-access boundary, and direct
contiguous slicing was substantially faster than copying individual retained
point views. Production parsing now uses descriptors without changing the
binary artifact layout or moving format validation into the prover algorithm.

## Recursion Same-Shape Clone Removal

`bench-recursion-clone-removal.ts` constructs representative `4096x256`
`fXY` and `gXY` recursion inputs from the prepared witness and state. It
compares the current same-shape `resize(...)` calls with explicit shape
assertions followed by direct, non-mutating `toRouEvals()` calls.

The benchmark uses two warmups and seven alternating-order measured
iterations. Exact ROU-evaluation parity, source-buffer immutability, a small
shape case, and wrong-shape rejection all pass.

| candidate | median | min | max | shape/resize | f NTT | g NTT | explicit copied MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current same-shape resize | 841.304 ms | 756.513 ms | 1008.740 ms | 3.371 ms | 459.878 ms | 378.024 ms | 64.000 |
| shape assert/direct | 811.030 ms | 737.142 ms | 920.786 ms | 0.006 ms | 346.040 ms | 464.962 ms | 0 |

The total median was `30.274 ms` (`3.6%`) lower, but the broad overlapping
ranges and the swapped per-NTT timing distribution show that most of that
difference is runtime noise. The attributable result is removal of about
`3.365 ms` of clone work and `64 MiB` of explicit coefficient copying. This is
a low-impact, memory-positive optimization; the report does not claim the
noisy NTT difference as a clone-removal speedup.

The candidate was promoted to production in commit `824db138`. Production
validates both recursion-polynomial shapes before either NTT, passes the
immutable source buffers directly to `toRouEvals()`, and preserves the
recursion equations and commitment path. The post-promotion benchmark also
compares the actual production recursion polynomial against the legacy resize
path byte-for-byte.

| post-promotion candidate | median | shape/resize | explicit copied MiB |
| --- | ---: | ---: | ---: |
| legacy same-shape resize | 690.316 ms | 3.019 ms | 64.000 |
| production shape assert/direct | 682.691 ms | 0.005 ms | 0 |

The production run removes `3.014 ms` of directly attributable clone work and
`64 MiB` of explicit coefficient copies. The broader `7.625 ms` median
difference remains subject to NTT scheduling noise.

## Production 2D NTT Task Shards

Production `biNttBuffer()` allocates one bit-reversed input shard per
ffjavascript task and passes segment views from that shard. The retained
`bench-2d-ntt-segment-scheduler.ts` benchmark checks the production direct-shard
path byte-for-byte against the legacy sequential transform and an independent
batched implementation in forward and inverse modes.

The rejected bit-reversal cache, direct inverse-output assembly, and combined
candidate measurements are preserved in the
[rejected candidate summary](../../../docs/optimization/rejected/rejected-candidate-summary.md);
their executable implementations are not retained.
