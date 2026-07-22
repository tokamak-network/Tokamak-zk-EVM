# Prover Optimization Timing History

Audience: backend-wasm engineers tracking prover performance changes across production optimizations.

This report is the durable timing ledger for prover hot-path work. `tmp/timing/prover-stage-timing.json` remains the latest overwritten diagnostics output. Each production optimization should add a new entry here with related commits, the applied optimization, and the relevant timing tables.

Timing notes:

- Historical `prove0`, `prove1`, `prove2`, `prove3`, and `prove4` names are diagnostics labels only. They are not production architecture boundaries.
- Stage timing categories and `poly_detail` spans may overlap. Use them for hotspot ranking and before/after direction, not additive wall-time accounting.
- Microbenchmarks and full prover diagnostics measure different scopes. Record both when both are available.

## Initial Stage Timing Baseline

Related commit:

- `486cdcc2` Add prover stage timing diagnostics

Optimization state:

- Baseline diagnostics before the later prover hot-path rewrites.
- The first table is the initial full stage timing table, as required by the optimization tracking policy.

Stage totals:

| diagnostic label | duration |
| --- | ---: |
| prove2 | 502.00 s |
| prove4 | 395.97 s |
| prove0 | 299.54 s |
| prove1 | 58.41 s |
| prove3 | 12.50 s |

Operation totals:

| operation group | duration |
| --- | ---: |
| encode.msm | 699.60 s |
| poly.combine | 449.12 s |
| poly_detail.mul | 303.08 s |
| poly_detail.toRouEvals | 186.45 s |
| poly_detail.addScaledPrefixAssign | 130.24 s |
| encode.prep | 18.84 s |
| pure div_by_ruffini | 19.70 s |
| pure div_by_vanishing_opt | 7.16 s |

Top measured events:

| event | duration |
| --- | ---: |
| encode.msm.prove2.Q_CX | 128.42 s |
| encode.msm.prove4.Pi_CX | 128.13 s |
| poly.combine.prove2.p3 | 97.53 s |
| encode.msm.prove4.Pi_AX | 65.89 s |
| encode.msm.prove2.Q_CY | 65.57 s |
| encode.msm.prove0.Q_AX | 65.12 s |
| poly_detail.mul.prove2.p3 | 62.35 s |

Conclusion:

- Pure division was not the first optimization target.
- Initial priority moved to commitment/MSM encoding, then polynomial multiplication and combination paths.

## Non-Coset 2D NTT Clone Removal

Related commit:

- `f583dd91` Avoid non-coset 2D NTT buffer clone

Applied optimization:

- `BivariatePolynomialBuffer.toRouEvals()` skips the coefficient-buffer clone for non-coset true 2D transforms and delegates directly to `biNttBuffer(...)`.

Operation benchmark:

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| 2d-ntt | current-toRouEvals | 512x256 | 213.667 |
| 2d-ntt | direct-biNttBuffer | 512x256 | 215.078 |
| 2d-ntt | transpose-only-cost | 512x256 | 6.578 |

Conclusion:

- The accepted change was a low-risk materialization cleanup. It avoided an unnecessary clone without claiming a major arithmetic speedup.

## Prover Buffer Cache And Dense Roundtrip Reduction

Related commits:

- `379eae9b` Cache prover polynomial buffers
- `8260b5ea` Reduce prover dense buffer roundtrips
- `eb28aadd` Use cached buffer for prover binding
- `4f187526` Remove unused prover state placeholders
- `6079f4a6` Optimize backend wasm prover buffers

Applied optimization:

- Prover state now builds and reuses `BivariatePolynomialBuffer` values for witness and instance data.
- Large production hot paths no longer repeatedly construct `DensePolynomialExt` values and immediately wrap them with `BivariatePolynomialBuffer.fromDense(...)`.
- Binding construction receives the cached `A_free` buffer directly.
- Unused migration-era prover state placeholders were removed.

Materialization benchmark:

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| materialization | buffer-clone | 4096x256 | 0.777 |
| materialization | toDense-fromDense-roundtrip | 4096x256 | 169.243 |
| materialization | fromBuffer-copy | 4096x256 | 1.021 |

Full prover check after the buffer cache:

| step | duration |
| --- | ---: |
| build prover binding | 2.14 s |
| prove0 diagnostic label | 76.23 s |
| prove1 diagnostic label | 24.43 s |
| prove2 diagnostic label | 261.47 s |
| prove3 diagnostic label | 9.68 s |
| prove4 diagnostic label | 147.41 s |
| verify generated proof | 19 ms |

Conclusion:

- Avoiding dense roundtrips was a clear production cleanup because the roundtrip cost was large at prover-representative shape.

## Axis-Specific Polynomial Multiplication

Related commits:

- `4bd3d333` Optimize axis-specific polynomial multiplication
- `b5596ebd` Benchmark generic polynomial multiplication scheduling

Applied optimization:

- `BivariatePolynomialBuffer.mul()` uses axis-specific 1D NTT multiplication when one operand is X-only or Y-only.
- Generic full 2D NTT multiplication remains the fallback for genuinely bivariate products.

Operation benchmark:

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| polynomial-mul | current-x-axis-factor | 4096x256 | 5536.177 |
| polynomial-mul | generic-2d-ntt-x-axis-factor | 4096x256 | 13155.656 |
| polynomial-mul | current-y-axis-factor | 4096x256 | 4005.074 |
| polynomial-mul | generic-2d-ntt-y-axis-factor | 4096x256 | 13009.296 |

Post-change diagnostics:

| step | duration |
| --- | ---: |
| prove2 diagnostic label | 182.32 s |
| prove4 diagnostic label | 120.59 s |
| verify generated proof | 14 ms |

Conclusion:

- Axis-specific multiplication was promoted because it avoids full 2D NTT work for structured hot-path operands and passed full prover diagnostics.

## Scaled-Add Fast Path

Related commit:

- `2fdea5f9` Optimize scaled polynomial accumulation

Applied optimization:

- `BivariatePolynomialBuffer.addScaledAssign(...)` and `addScaledPrefixAssign(...)` skip zero factors.
- Factors equal to `1` or `-1` avoid unnecessary field multiplication.

Operation benchmark:

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| linear-combination | current-linearCombinationBuffer | 4096x256 | 1232.803 |
| linear-combination | preallocated-addScaledPrefixAssign | 4096x256 | 1149.804 |

Post-change diagnostics:

| step | duration |
| --- | ---: |
| prove2 diagnostic label | 166.27 s |
| prove4 diagnostic label | 106.44 s |
| verify generated proof | 17 ms |

Post-change stage timing:

| category | duration |
| --- | ---: |
| stage | 375.46 s |
| poly_detail | 339.43 s |
| poly | 228.27 s |
| encode | 115.06 s |
| init | 17.34 s |
| io | 1.02 s |
| verify | 17 ms |
| output | 2 ms |

Conclusion:

- The synthetic benchmark mainly proved that the fast-path checks did not materially regress the generic non-unit case.
- Integrated diagnostics justified the production change because many real prover terms use unit or negative-unit factors.

## Rejected Transpose-Scheduled Row/Column NTT Trial

Related commits:

- `b5596ebd` Benchmark generic polynomial multiplication scheduling

Applied optimization attempt:

- A temporary production trial made `BivariatePolynomialBuffer.biNttBuffer(...)` use the transpose-scheduled row/column path.
- Correctness checks passed, but integrated timing worsened, so the production change was reverted.

Operation benchmark before production trial:

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| 2d-ntt | current-toRouEvals | 4096x256 | 2017.446 |
| 2d-ntt | transpose-scheduled-biNttBuffer | 4096x256 | 1954.511 |
| polynomial-mul | current-bivariate | 4096x256 | 28059.481 |
| polynomial-mul | transpose-scheduled-bivariate | 4096x256 | 26910.071 |

Full integrated timing:

| category | before | after trial |
| --- | ---: | ---: |
| stage | 375.46 s | 397.60 s |
| poly_detail | 339.43 s | 359.02 s |
| poly | 228.27 s | 244.10 s |
| encode | 115.06 s | 119.43 s |

Conclusion:

- The transpose-scheduled path remains benchmark-only. Do not promote it without new representative evidence that also improves full integrated prover timing.

## Shared-Right Local Multiplication Kernel

Related commits:

- `660ac9c0` Add fused polynomial expression evaluator
- `b42e3784` Sync prover timing with production encoder

Applied optimization:

- `computeCopyQuotientCommitments(...)` uses a local shared-right kernel for the two products that share `fXY`.
- The shared right operand's ROU evals are reused only inside that expression.
- No global ROU-eval cache was introduced.

Operation benchmark:

| group | candidate | shape | ms/op |
| --- | --- | ---: | ---: |
| polynomial-mul | current-two-bivariate-shared-right | 1024x256 | 12241.948 |
| polynomial-mul | shared-right-rou-two-bivariate | 1024x256 | 10345.247 |
| polynomial-mul | current-two-bivariate-shared-right | 4096x256 | 52897.629 |
| polynomial-mul | shared-right-rou-two-bivariate | 4096x256 | 44619.771 |

Before/after diagnostics:

| signal | before | after |
| --- | ---: | ---: |
| testing-mode prove2 diagnostic label | 167.13 s | 152.58 s |
| stage-timing stage total | 355.31 s | 349.14 s |
| stage-timing poly total | 213.36 s | 207.43 s |

Post-change stage timing:

| category | duration |
| --- | ---: |
| stage | 349.14 s |
| poly_detail | 276.41 s |
| poly | 207.43 s |
| encode | 111.32 s |
| init | 15.40 s |
| io | 866 ms |
| verify | 16 ms |
| output | 3 ms |

Conclusion:

- The local shared-right kernel was accepted only for the measured expression.
- Do not generalize this into global expression rewriting or global ROU-eval caching without another local benchmark and full diagnostics.

## Snarkjs-Style Large-MSM Delivery And Chunk Size

Related commits:

- `eb75a1ea` Use chunked dense prover commitments
- `b42e3784` Sync prover timing with production encoder
- `a444cd2d` Record prover chunk size benchmark
- `4ad07307` Record local prover chunk limit
- `0156fecf` Add peak memory to prover chunk benchmark
- `e5b344d8` Record reboot prover memory benchmark
- `52cf1861` Set prover dense MSM chunk size

Applied optimization:

- Large dense `sigma1.xy-powers` commitments use bounded dense MSM chunks.
- The dense path uses the raw CRS section and `Fr.batchFromMontgomeryBuffer(...)`, matching snarkjs's raw scalar buffer delivery pattern at the `multiExpAffine(...)` boundary.
- The production dense MSM chunk size is fixed at `262144` points by project-owner decision.

Browser acceptance after chunked delivery:

| signal | result |
| --- | ---: |
| browser proof size | 2408 bytes |
| browser proveBinary | 414.59 s |
| browser verify generated proof | 19 ms |

Post-priority-1 stage timing:

| category | duration |
| --- | ---: |
| stage | 374.10 s |
| poly_detail | 281.05 s |
| poly | 211.65 s |
| encode | 130.88 s |
| init | 15.47 s |
| io | 938 ms |
| verify | 17 ms |
| output | 2 ms |

Post-`262144` chunk timing:

| category | duration |
| --- | ---: |
| stage | 355.70 s |
| poly_detail | 284.37 s |
| poly | 213.94 s |
| encode | 110.44 s |
| init | 15.80 s |
| io | 797 ms |
| verify | 17 ms |
| output | 3 ms |

Post-`262144` operation-type totals:

| operation group | duration |
| --- | ---: |
| poly.combine | 196.46 s |
| poly.linear/add | 118.04 s |
| encode.commit.total | 108.51 s |
| poly.mul | 77.02 s |
| poly.toRouEvals | 52.87 s |
| poly.fromRouEvals | 30.58 s |
| poly.div | 17.47 s |
| init.witness | 10.95 s |
| init.state | 4.86 s |

Chunk-size browser/RSS benchmark:

| chunk points | browser prove time | peak total RSS |
| ---: | ---: | ---: |
| 16384 | 408.01 s | 17.29 GiB |
| 32768 | 396.12 s | 17.75 GiB |
| 65536 | 393.56 s | 17.90 GiB |
| 131072 | 387.96 s | 18.01 GiB |
| 262144 | 384.92 s | 18.51 GiB |
| 524288 | 387.97 s | 22.10 GiB |

Reboot peak-RSS rerun:

| chunk points | peak total RSS |
| ---: | ---: |
| 16384 | 17.68 GiB |
| 32768 | 17.89 GiB |
| 65536 | 18.14 GiB |
| 131072 | 18.28 GiB |
| 262144 | 18.06 GiB |
| 524288 | 20.29 GiB |

Conclusion:

- Chunked dense MSM delivery fixed the browser `DataCloneError` and established browser proof generation plus in-browser verification.
- `262144` is the current production default.
- Future chunk-size tuning is lowest priority until the rest of prover optimization is complete.

## Shape-Aware Linear Operation Rewrite

Related commits:

- `1c05593d` Add linear operation flat-kernel benchmark
- `3c7da223` Benchmark linear operation optimization candidates
- `cddceefe` Optimize polynomial linear accumulation

Applied optimization:

- Same-shape flat accumulation for add/sub/addScaled paths.
- Prefix row-offset accumulation for prefix-contained terms.
- Direct subtraction for `-1` factors.
- First nonzero term accumulator construction in `linearCombinationBuffer(...)`.
- Shape-aware dispatch through optimized accumulation kernels.
- Candidate 4, the two-pass temporary scaled-source buffer, was rejected.

Operation benchmark, representative `4096x256` before/after:

| path | before | after | speedup | reduction |
| --- | ---: | ---: | ---: | ---: |
| current-add | 432.404 ms | 349.267 ms | 1.24x | 19.2% |
| current-sub | 544.954 ms | 346.478 ms | 1.57x | 36.4% |
| current-addScaledAssign | 369.712 ms | 353.012 ms | 1.05x | 4.5% |
| current-prefix-addScaledAssign | 113.229 ms | 90.786 ms | 1.25x | 19.8% |
| current-linearCombinationBuffer | 1322.379 ms | 918.179 ms | 1.44x | 30.6% |
| current-mixed-prefix-linearCombination | 993.944 ms | 656.714 ms | 1.51x | 33.9% |

Integrated stage timing:

| category or event group | before | after |
| --- | ---: | ---: |
| stage total | 355.70 s | 344.27 s |
| poly total | 213.94 s | 200.66 s |
| poly_detail total | 284.37 s | 258.09 s |
| poly.combine | 196.46 s | 182.45 s |
| poly.linear/add | 118.04 s | 74.55 s |

Conclusion:

- The accepted linear rewrite reduced the measured linear/add component materially.
- Direct snarkjs inspection found no additional add/sub/scaling technique to import beyond the buffer, in-place, scalar-fused, and accumulator-reuse patterns already applied here.

## Future Reporting Rule

For every future production optimization:

1. Keep `tmp/timing/prover-stage-timing.json` as the latest overwritten diagnostics output.
2. Add a new section to this report.
3. Put related commits at the top of that section.
4. Describe the optimization and any rejected candidates.
5. Add operation-level timing tables and full stage timing tables when available.
6. State whether the change was promoted, rejected, or kept benchmark-only.
7. Link the relevant ignored `tmp/timing/*.json` filename when a named benchmark output exists.
