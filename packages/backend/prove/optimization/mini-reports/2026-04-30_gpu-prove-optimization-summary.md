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

4. **Special-form polynomial multiplication was accepted in targeted form.**

   Several `prove4` linear combinations multiply by special polynomials where a generic NTT-based multiplication is unnecessary:

   - `t_n` and `t_smax` are two-term vanishing polynomials.
   - `X_mono` is a monomial.
   - `term9` is a small sparse polynomial in the measured proof.

   The accepted implementation adds shift/scale coefficient helpers for these cases and uses them in `Pi_A`, `term_B_zk`, and `LHS_zk1`. The accepted variant keeps `lagrange_K0_XY` multiplication on the existing generic path because the measured CPU prefix-window replacement was slower than ICICLE's generic multiplication for `LHS_zk2`.

   | metric | before | special-lite | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 31.712050 s | 31.318987 s | -0.393063 s |
   | prove4 total | 10.152243 s | 9.901451 s | -0.250793 s |
   | prove4 poly | 7.805363 s | 7.532867 s | -0.272497 s |
   | `poly.combine.prove4.Pi_A` | 0.913962 s | 0.906991 s | -0.006971 s |
   | `poly.combine.prove4.term_B_zk` | 0.126669 s | 0.129554 s | +0.002885 s |
   | `poly.combine.prove4.LHS_zk1` | 1.335036 s | 1.249776 s | -0.085260 s |
   | `poly.combine.prove4.LHS_zk2` | 1.214135 s | 1.233239 s | +0.019104 s |
   | `poly.combine.prove4.LHS_for_copy` | 0.783756 s | 0.587478 s | -0.196279 s |

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

## Current Accepted Baseline

The current accepted CUDA baseline is `timing.remote.special-poly-mul-lite.cuda.json`:

- total wall: `31.318987 s`
- init: `0.732530 s`
- prove4: `9.901451 s`
- uvwXY: `0.283615 s`
- s0/s1: `0.054247 s`

Future optimization should treat `prove2.div_by_vanishing_opt` and selected `prove4` polynomial operations as the next higher-value targets. Fused linear combination and `lagrange_K0_XY` special multiplication should only be reconsidered in narrower forms if they are measured one site at a time.
