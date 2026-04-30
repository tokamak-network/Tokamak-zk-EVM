# Mini Report: 2026-04-30 GPU Prove Optimization Summary

## Scope

This report summarizes the CUDA prove optimization experiments performed on the `prove-gpu-opt` branch. The remote CUDA host was used only for experiments; source changes were made locally and synchronized to the remote workspace for measurement.

## Reference Runs

| artifact | total_wall | init | prove4 | uvwXY | s0_s1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `timing.remote.cuda.json` | 62.418158 s | 32.020607 s | 9.923205 s | 30.420833 s | 1.198673 s |
| `timing.remote.hybrid-sparse-uvw.cuda.json` | 39.731573 s | 8.815259 s | 10.106856 s | 7.209468 s | 1.204926 s |
| `timing.remote.r1cs-binary-sparse.cuda.json` | 32.728363 s | 1.889289 s | 10.128410 s | 0.282576 s | 1.206917 s |
| `timing.remote.s0s1-pow-cache.cuda.json` | 31.712050 s | 0.748165 s | 10.152243 s | 0.286227 s | 0.057586 s |
| `timing.remote.fused-poly-lc.cuda.json` | 32.072216 s | 0.736439 s | 10.430511 s | 0.288673 s | 0.054418 s |
| `timing.remote.special-poly-mul.cuda.json` | 31.536390 s | 0.736913 s | 10.054102 s | 0.286999 s | 0.054550 s |
| `timing.remote.special-poly-mul-lite.cuda.json` | 31.318987 s | 0.732530 s | 9.901451 s | 0.283615 s | 0.054247 s |
| `timing.remote.existing-api-special-poly-mul.cuda.json` | 31.237394 s | 0.737941 s | 9.939695 s | 0.289162 s | 0.053828 s |
| `timing.remote.batch-encode.cuda.json` | 31.744249 s | 0.736217 s | 10.721734 s | 0.288986 s | 0.055206 s |
| `timing.remote.batch-encode-prove0-prove2.cuda.json` | 31.387785 s | 0.743366 s | 10.096364 s | 0.289947 s | 0.055855 s |

## Successful Changes

1. **Sparse uvwXY generation reduced the CUDA init bottleneck substantially.**

   The original CUDA timing had `init.build.witness.uvwXY = 30.420833 s`. The sparse uvwXY path reduced it to `7.209468 s` in `timing.remote.hybrid-sparse-uvw.cuda.json`. This changed the dominant init cost from dense matrix work to sparse R1CS input construction and coefficient conversion.

2. **Binary `.r1cs` sparse preload was the largest accepted logic improvement.**

   Switching the common CPU/GPU R1CS preload path to use binary `.r1cs` files when available reduced remote CUDA total wall time from `39.731573 s` to `32.728363 s`. The same change helped local CPU timing as well:

   | artifact | total_wall | init | uvwXY |
   | --- | ---: | ---: | ---: |
   | `timing.local.cpu.json` | 65.271813 s | 8.266230 s | 2.186955 s |
   | `timing.local.cpu.r1cs-binary-sparse.json` | 56.905538 s | 6.011812 s | 0.259326 s |

   The binary format was useful because it already exposes sparse linear combinations. It avoids JSON parse and decimal-to-hex conversion work and allows direct construction of sparse rows for uvwXY.

3. **Caching permutation power tables for `s0/s1` was accepted.**

   The `s0_s1` build step was reduced from `1.206917 s` to `0.057586 s` on remote CUDA. The total wall time improved from `32.728363 s` to `31.712050 s`. Local CPU showed the same target improvement:

   | artifact | init | s0_s1 |
   | --- | ---: | ---: |
   | `timing.local.cpu.r1cs-binary-sparse.json` | 6.011812 s | 0.629767 s |
   | `timing.local.cpu.s0s1-pow-cache.json` | 5.425999 s | 0.115509 s |

   The CPU total wall time had run-to-run noise (`56.905538 s` to `57.162002 s`), but the targeted stage improved clearly.

## Failed Or Rejected Changes

1. **Host round-trip and small memory-movement optimizations were not adopted.**

   These changes were rejected by project direction: optimization should be limited to logic changes rather than small memory-transfer techniques. The branch was restored away from that line of work.

2. **Broad fused polynomial linear combination was tested and rejected.**

   The experiment introduced an ICICLE `execute_program`-based field linear-combination helper and rewrote several `prove4` combine sites. For expressions containing polynomial multiplication, the polynomial-multiplication terms were precomputed first and then passed to the fused linear combination.

   The result regressed:

   | metric | before | fused LC | delta |
   | --- | ---: | ---: | ---: |
   | total_wall | 31.712050 s | 32.072216 s | +0.360166 s |
   | prove4 total | 10.152243 s | 10.430511 s | +0.278267 s |
   | prove4 poly | 7.805363 s | 8.058765 s | +0.253402 s |
   | `poly.combine.prove4.*` sum | 5.170600 s | 5.461452 s | +0.290852 s |

   Some individual targets improved slightly, but the broad rewrite was negative:

   | target | before | fused LC | delta |
   | --- | ---: | ---: | ---: |
   | `V` | 0.265933 s | 0.249069 s | -0.016863 s |
   | `Pi_A` | 0.913962 s | 0.882957 s | -0.031005 s |
   | `LHS_for_copy` | 0.783756 s | 0.746147 s | -0.037609 s |
   | `pC` | 0.403060 s | 0.737929 s | +0.334869 s |
   | `LHS_zk1` | 1.335036 s | 1.351338 s | +0.016302 s |
   | `LHS_zk2` | 1.214135 s | 1.226827 s | +0.012692 s |

   The likely reason is that `execute_program` setup plus coefficient-vector preparation outweighed the saved scalar-mul/add passes, especially for the 5-term `pC` combine. This experiment should not be kept as a general optimization.

3. **Generic replacement of `lagrange_K0_XY` multiplication was tested and rejected.**

   `lagrange_K0_XY` has constant coefficients, so it is not a fully generic dense polynomial. However, the measured replacement used a CPU prefix-window convolution and regressed `LHS_zk2`.

   | metric | before | lagrange replacement | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 31.712050 s | 31.536390 s | -0.175661 s |
   | prove4 total | 10.152243 s | 10.054102 s | -0.098141 s |
   | prove4 poly | 7.805363 s | 7.728992 s | -0.076371 s |
   | `poly.combine.prove4.LHS_zk2` | 1.214135 s | 1.737784 s | +0.523649 s |

   The total still improved because other special-form replacements helped, but the `lagrange_K0_XY` sub-change was clearly negative. The accepted code therefore excludes it.

4. **Ad hoc host-loop special multiplication helpers were removed.**

   The `timing.remote.special-poly-mul-lite.cuda.json` run was faster than the previous baseline, but the implementation added custom `DensePolynomialExt` helpers that copied dense coefficients to host memory and performed shift/scale/add loops on the CPU. This violated the intended direction for this optimization. The helpers were removed, and the retained implementation uses only existing library APIs.

   A follow-up attempt to keep `term9` multiplication generic while still using `mul_monomial` for `(1 - X)` failed because the existing `mul_monomial` implementation can overflow its output buffer when shifting an already full-width polynomial. That experiment is not retained.

5. **Existing-API special polynomial multiplication was tested and rolled back.**

   After removing the host-loop helpers, the special products were rewritten using only existing polynomial APIs: `mul_monomial`, scalar multiplication, addition, and subtraction. The measured total wall time improved in one CUDA run, but the target `poly.combine` sites did not show a clean win. In particular, `LHS_zk1` regressed and `LHS_zk2` also moved slightly in the wrong direction, while most of the apparent improvement came from downstream `LHS_for_copy` and run-to-run variation.

   | metric | before | existing-api | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 31.712050 s | 31.237394 s | -0.474657 s |
   | prove4 total | 10.152243 s | 9.939695 s | -0.212548 s |
   | prove4 poly | 7.805363 s | 7.596426 s | -0.208937 s |
   | `poly.combine.prove4.Pi_A` | 0.913962 s | 0.900134 s | -0.013828 s |
   | `poly.combine.prove4.term_B_zk` | 0.126669 s | 0.125349 s | -0.001321 s |
   | `poly.combine.prove4.LHS_zk1` | 1.335036 s | 1.406641 s | +0.071606 s |
   | `poly.combine.prove4.LHS_zk2` | 1.214135 s | 1.232757 s | +0.018622 s |
   | `poly.combine.prove4.LHS_for_copy` | 0.783756 s | 0.582091 s | -0.201665 s |

   The `prove4` polynomial combination code was restored to the original generic expression form. The timing artifact is kept as an experiment record, but it is no longer the accepted baseline.

6. **Batch encoding was tested and rolled back.**

   `encode_poly` is an MSM over the shared `sigma1.xy_powers` bases. ICICLE supports shared-bases batch MSM, so independent encodes can be combined by concatenating coefficient vectors and producing multiple MSM results in one call.

   The first experiment grouped `prove0`, `prove2`, and `prove4` encodes. The `prove4` pairs were:

   - `Pi_AX`, `Pi_AY`
   - `M_X`, `M_Y`
   - `N_X`, `N_Y`
   - `Pi_CX`, `Pi_CY`

   This regressed because the paired Y-side encodes are very small while the batch uses the larger shared base size. The large X-side encodes did not benefit enough to offset that padding and batch preparation cost.

   | metric | before | full batch | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 31.712050 s | 31.744249 s | +0.032199 s |
   | `prove0.encode` | 2.100660 s | 1.874242 s | -0.226418 s |
   | `prove2.encode` | 1.668537 s | 1.643627 s | -0.024911 s |
   | `prove4.encode` | 2.322183 s | 2.918992 s | +0.596809 s |

   A second experiment limited batching to independent `prove0` and `prove2` encodes:

   - `prove0`: `U`, `V`, `W`, `Q_AX`, `Q_AY`, `B`
   - `prove2`: `Q_CX`, `Q_CY`

   | metric | before | batch prove0/prove2 | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 31.712050 s | 31.387785 s | -0.324265 s |
   | `prove0.encode` | 2.100660 s | 1.883973 s | -0.216687 s |
   | `prove2.encode` | 1.668537 s | 1.662291 s | -0.006246 s |
   | `prove4.encode` | 2.322183 s | 2.313270 s | -0.008913 s |

   The selected run showed a small total improvement, but the change is at the noise level for this benchmark and is not accepted as a reliable optimization. The `batch_encode_poly` API and its `prove0`/`prove2` call sites were removed, restoring the original individual `encode_poly` calls. The timing artifacts are kept only as experiment records.

## Current Accepted Baseline

The current accepted CUDA baseline is `timing.remote.s0s1-pow-cache.cuda.json`:

- total wall: `31.712050 s`
- init: `0.748165 s`
- prove4: `10.152243 s`
- uvwXY: `0.286227 s`
- s0/s1: `0.057586 s`

Future optimization should treat `prove2.div_by_vanishing_opt` and selected `prove4` polynomial operations as the next higher-value targets. Fused linear combination and `lagrange_K0_XY` special multiplication should only be reconsidered in narrower forms if they are measured one site at a time.
