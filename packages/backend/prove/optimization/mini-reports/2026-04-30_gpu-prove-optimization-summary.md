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
| `timing.remote.div-by-vanishing-recurrence.cuda.json` | 28.910223 s | 0.746520 s | 10.058344 s | 0.287018 s | 0.057240 s |
| `timing.remote.strict.cuda.json` | 28.598577 s | 0.739194 s | 9.985713 s | 0.281175 s | 0.055986 s |
| `timing.remote.poly-comb-algebraic.cuda.json` | 27.490122 s | 0.734930 s | 9.541593 s | 0.286616 s | 0.055128 s |
| `timing.remote.special-form-products.cuda.json` | 26.709146 s | 0.740477 s | 9.519266 s | 0.284122 s | 0.054744 s |

## Timing Semantics Correction

Earlier timing artifacts used broad spans around some encode and division call sites. Those spans were useful for end-to-end module accounting, but they mixed polynomial preparation work with the target operation being discussed.

The strict timing artifact, `timing.remote.strict.cuda.json`, separates the boundaries as follows:

- `encode` is pure MSM time inside polynomial encoding.
- polynomial operations needed before encoding are reported under `poly`.
- `div_by_vanishing_opt` and `div_by_ruffini` include only the division calls.
- numerator construction for those divisions is reported separately as `poly.combine` or `poly.add`.

Under this stricter view, the dominant prove cost is polynomial combination, not pure division or MSM:

| category or operation | time |
| --- | ---: |
| category `poly` | 20.568262 s |
| category `encode` | 1.262047 s |
| `poly.combine` | 15.840093 s |
| `poly.div_by_vanishing_opt` | 1.310417 s |
| `poly.div_by_ruffini` | 1.510268 s |

The pure vanishing-division calls are:

| event | time |
| --- | ---: |
| `poly.div_by_vanishing_opt.prove0.q0q1` | 0.461748 s |
| `poly.div_by_vanishing_opt.prove2.qCXqCY` | 0.848669 s |

The largest strict polynomial-combination sites in this run are:

| event | time |
| --- | ---: |
| `poly.combine.prove2.p_comb` | 4.500720 s |
| `poly.combine.prove2.Q_CY` | 1.943383 s |
| `poly.combine.prove2.Q_CX` | 1.616636 s |
| `poly.combine.prove4.LHS_zk1` | 1.326547 s |
| `poly.combine.prove4.LHS_zk2` | 1.204088 s |
| `poly.combine.prove4.Pi_A` | 0.912939 s |

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

4. **Coefficient-domain vanishing division was accepted.**

   `div_by_vanishing_opt` now uses the special form of the denominators, `X^c - 1` and `Y^d - 1`, directly in coefficient space. Instead of evaluating on cosets, multiplying by tiled denominator inverses, and interpolating back, it computes the quotient blocks by recurrence:

   - for `Y^d - 1`: `q_j = q_{j-d} - p_j`
   - for `X^c - 1`: `q_i = q_{i-c} - p_i`

   This removes the dominant 2D NTT work from the division path while preserving the same decomposition `P = Q_X (X^c - 1) + Q_Y (Y^d - 1)`.

   The table below uses the legacy broad division-site spans from the original artifacts. Those spans measured the call-site region around the division and, for some sites, included polynomial numerator construction. They remain useful for comparing the accepted recurrence change against the immediately preceding run, but they should not be read as pure division time.

   | metric | before | recurrence | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 31.712050 s | 28.910223 s | -2.801828 s |
   | legacy `poly.div_by_vanishing_opt.prove0.q0q1` span | 2.149125 s | 1.087509 s | -1.061616 s |
   | legacy `poly.div_by_vanishing_opt.prove2.qCXqCY` span | 7.113222 s | 5.397610 s | -1.715612 s |
   | `prove0.total` | 6.109721 s | 5.032357 s | -1.077364 s |
   | `prove2.total` | 12.713798 s | 11.073070 s | -1.640729 s |
   | category `poly` | 17.958210 s | 15.106989 s | -2.851220 s |

   A strict follow-up measurement shows that the pure vanishing-division calls now take `1.310417 s` total: `0.461748 s` for `prove0.q0q1` and `0.848669 s` for `prove2.qCXqCY`. The CUDA timing test passed with this implementation. The remaining pure division time is mostly coefficient extraction, block accumulation, recurrence loops, and polynomial materialization rather than NTT-based division.

5. **Algebraic polynomial-combination rewrites were accepted.**

   The polynomial-combination pass applies algebraic factorization and cross-stage caching to reduce generic polynomial multiplication calls. The intended static reduction is 12 polynomial multiplications:

   - factor `prove2.Q_CX` and `prove2.Q_CY` as `A * (rB * D + rR * g_D)`;
   - cache `R * G` inside `prove2.p_comb`;
   - factor `prove4.LHS_zk1` using `chi - X = (1 - X) + (chi - 1)`;
   - factor `prove4.LHS_zk2` around `K0`;
   - cache `W_zk = rW_X * t_n + rW_Y * t_smax` from `prove0.W` for `prove4.Pi_A`;
   - cache `term_B_zk = rB_X * t_mi + rB_Y * t_smax` from `prove0.B`;
   - cache `lagrange_KL_XY` from `prove2` for `prove4`.

   | metric | strict baseline | algebraic comb | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 28.598577 s | 27.490122 s | -1.108455 s |
   | category `poly` | 20.568262 s | 19.444623 s | -1.123639 s |
   | `poly.combine` | 15.840093 s | 14.863306 s | -0.976787 s |
   | `poly.mul` | 0.117172 s | 0.008618 s | -0.108554 s |
   | `prove2.total` | 10.908775 s | 10.312476 s | -0.596299 s |
   | `prove4.total` | 9.985713 s | 9.541593 s | -0.444121 s |

   Main target-level changes:

   | event | strict baseline | algebraic comb | delta |
   | --- | ---: | ---: | ---: |
   | `poly.combine.prove2.p_comb` | 4.500720 s | 3.943680 s | -0.557040 s |
   | `poly.combine.prove2.Q_CX` | 1.616636 s | 1.620061 s | +0.003425 s |
   | `poly.combine.prove2.Q_CY` | 1.943383 s | 1.888867 s | -0.054516 s |
   | `poly.combine.prove4.LHS_zk1` | 1.326547 s | 1.150340 s | -0.176207 s |
   | `poly.combine.prove4.LHS_zk2` | 1.204088 s | 1.194040 s | -0.010047 s |
   | `poly.combine.prove4.Pi_A` | 0.912939 s | 0.917377 s | +0.004438 s |
   | `poly.combine.prove4.term_B_zk` | 0.126422 s | 0.000000 s | -0.126422 s |
   | `poly.mul.prove4.KL` | 0.108116 s | 0.000000 s | -0.108116 s |

   `Q_CX` and `Pi_A` were neutral in this run, but the batch is positive overall because `p_comb`, `LHS_zk1`, `term_B_zk`, and `KL` improved clearly. The CUDA timing test passed.

6. **Special-form polynomial products were accepted.**

   After the algebraic-combination rewrite, detail timing showed that generic polynomial multiplication remained the largest component inside `poly.combine.*` spans:

   | detail operation | time |
   | --- | ---: |
   | multiplication | 8.791025 s |
   | addition | 5.720295 s |
   | scaling | 0.625577 s |

   The remaining generic polynomial multiplications were reviewed. `lagrange_KL_XY` and `lagrange_K0_XY` were excluded from the special-form target list. Out of 23 generic polynomial multiplications inside active `poly.combine.*` spans, 14 were direct special-form candidates:

   | class | count | implementation |
   | --- | ---: | --- |
   | low-degree polynomial times vanishing binomial | 4 | build `-P` in the low region and `+P` shifted by the vanishing exponent |
   | dense polynomial times simple X-binomial | 4 | replace generic multiplication with monomial shift plus add/sub |
   | degree-1 univariate times dense polynomial | 4 | expand `(a0 + a1 X) * P` or `(b0 + b1 Y) * P` |
   | sparse low-degree bivariate times dense polynomial | 2 | use `term9 = c0 + cX X + cY Y` and expand into shifted scaled copies |

   The accepted implementation preserves the original expressions in comments and applies the special forms to:

   - `prove0.W` and `prove0.B`;
   - `prove2.p_comb`;
   - `prove2.Q_CX` and `prove2.Q_CY`;
   - `prove4.LHS_zk1` and `prove4.LHS_zk2`.

   Measurement against `timing.remote.poly-comb-detail.cuda.json` shows a clear net win:

   | metric | before | special-form products | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 28.113656 s | 26.709146 s | -1.404511 s |
   | `poly.combine` | 15.239995 s | 14.007280 s | -1.232715 s |
   | detail multiplication | 8.791025 s | 4.914589 s | -3.876436 s |
   | detail addition | 5.720295 s | 7.076283 s | +1.355988 s |
   | detail scaling | 0.625577 s | 0.807468 s | +0.181891 s |

   The change removes a large amount of generic multiplication work, but some of that gain is offset by more shifts, additions, and scalar multiplications. The largest improved targets were:

   | target | before | after | delta |
   | --- | ---: | ---: | ---: |
   | `prove2.Q_CY` | 1.930174 s | 1.078511 s | -0.851663 s |
   | `prove2.Q_CX` | 1.650657 s | 1.167393 s | -0.483264 s |
   | `prove2.p_comb` | 4.021669 s | 3.748907 s | -0.272763 s |
   | `prove4.LHS_zk2` | 1.211318 s | 0.982824 s | -0.228493 s |

   This result shifts the next optimization target from generic multiplication count to wrapper-level addition, shift, scaling, and intermediate-polynomial creation costs.

## Diagnostic Timing

### Polynomial-combination detail timing

`timing.remote.poly-comb-detail.cuda.json` is a diagnostic run on top of the accepted algebraic-combination code. It adds nested `poly_detail` events while a `poly.combine.*` span is active. These detail events are excluded from the normal `poly` totals to avoid double-counting, and the run should not be used as the accepted performance baseline because the additional timing records add measurement overhead.

The detail totals show that generic polynomial multiplication is still the largest component inside polynomial-combination spans, but addition is also a large fraction:

| detail operation | time |
| --- | ---: |
| multiplication | 8.791025 s |
| addition | 5.720295 s |
| scaling | 0.625577 s |

Top detail targets:

| target | addition | multiplication | scaling | total |
| --- | ---: | ---: | ---: | ---: |
| `prove2.p_comb` | 0.281001 s | 3.689850 s | 0.050819 s | 4.021669 s |
| `prove2.Q_CY` | 0.284850 s | 1.609415 s | 0.035909 s | 1.930174 s |
| `prove2.Q_CX` | 0.619124 s | 1.008238 s | 0.023295 s | 1.650657 s |
| `prove4.LHS_zk2` | 0.187774 s | 0.983838 s | 0.039706 s | 1.211318 s |
| `prove4.LHS_zk1` | 0.180626 s | 0.949706 s | 0.043845 s | 1.174176 s |
| `prove4.Pi_A` | 0.793005 s | 0.000000 s | 0.133940 s | 0.926945 s |
| `prove4.LHS_for_copy` | 0.674182 s | 0.000000 s | 0.109677 s | 0.783859 s |

This changes the next optimization question: reducing multiplication count alone is not enough. The remaining polynomial-combination cost also includes substantial repeated addition/resizing work, especially in scalar-linear-combination sites such as `Pi_A`, `LHS_for_copy`, `Q_AX`, `Q_AY`, and `pC`.

### Add/mul internal line breakdown

`timing.remote.poly-op-line-breakdown.cuda.json` is a diagnostic run on top of the current special-form-products baseline. It instruments the internals of `DensePolynomialExt` add/sub/add-assign, scalar add/sub, scalar multiplication, and generic polynomial multiplication while a `poly.combine.*` span is active.

The run should not be used as a clean performance baseline because the extra events add measurement overhead. It is useful for identifying where the existing `addition`, `multiplication`, and `scaling` detail totals come from.

Top internal add/sub costs:

| step | time | count |
| --- | ---: | ---: |
| `addassign_resize_operands` | 4.154828 s | 37 |
| `add_resize_operands` | 1.750222 s | 22 |
| `sub_resize_operands` | 0.727609 s | 5 |
| `addassign_clone_operands` | 0.137240 s | 47 |
| `add_clone_operands` | 0.061107 s | 24 |
| `sub_clone_operands` | 0.021419 s | 7 |
| `addassign_icicle_add` | 0.020485 s | 47 |
| `add_icicle_add` | 0.008253 s | 24 |
| `sub_icicle_sub` | 0.002967 s | 7 |

The actual ICICLE add/sub calls total only about `0.031705 s`. The dominant add/sub cost is operand resizing before the operation: about `6.632659 s`.

Top internal generic multiplication costs:

| step | time | count |
| --- | ---: | ---: |
| `mul_lhs_to_rou_evals` | 0.991095 s | 9 |
| `mul_rhs_to_rou_evals` | 0.989168 s | 9 |
| `mul_clone_resize_rhs` | 0.759121 s | 9 |
| `mul_clone_resize_lhs` | 0.707461 s | 9 |
| `mul_optimize_size` | 0.607036 s | 9 |
| `mul_from_rou_evals` | 0.320329 s | 9 |
| `mul_find_rhs_degree` | 0.279823 s | 9 |
| `mul_find_lhs_degree` | 0.152890 s | 9 |
| `mul_icicle_eval_mul` | 0.113471 s | 9 |

Generic multiplication is dominated by NTT conversion and wrapper resizing. The element-wise evaluation multiplication itself is only `0.113471 s`. Exact degree work is material inside generic multiplication: `find_degree` totals `0.432713 s`, and `optimize_size` totals `0.607036 s`; however, the complete conservative-degree experiment showed that removing this work globally did not improve end-to-end time.

Top internal scalar multiplication costs:

| step | time | count |
| --- | ---: | ---: |
| `scalar_mul_copy_coeffs` | 0.432185 s | 77 |
| `scalar_mul_icicle_scalar_mul` | 0.228732 s | 77 |
| `scalar_mul_from_coeffs` | 0.054522 s | 77 |
| `scalar_mul_alloc_output` | 0.037745 s | 77 |
| `scalar_mul_alloc_input` | 0.031187 s | 77 |

This diagnostic points to a more precise next target: construct polynomial-combination outputs at their final dimensions, avoiding chained resize-heavy add/sub operations. Replacing ICICLE add/sub or the field multiplication primitive itself is unlikely to help.

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

7. **`DensePolynomialExt` add/sub size-equal fast paths were tested and rejected.**

   The experiment added size-equal fast paths for `Add`, `Sub`, and `AddAssign` so equal-sized operands could skip wrapper-level cloning and resize checks. The code compiled and the timing test passed, but the CUDA measurement regressed slightly against the accepted `timing.remote.special-form-products.cuda.json` baseline:

   | metric | before | add/sub fast path | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 26.709146 s | 26.920904 s | +0.211758 s |
   | `poly.combine` | 14.007280 s | 14.066674 s | +0.059394 s |
   | detail addition | 7.076283 s | 7.094381 s | +0.018098 s |
   | detail scaling | 0.807468 s | 0.789332 s | -0.018135 s |

   The result indicates that this path does not reduce the dominant cost. The likely bottleneck is the number of ICICLE add/sub operations and intermediate polynomial constructions, not the Rust-side branch that cloned operands before checking dimensions. The code change was rolled back and the timing artifact is kept only as an experiment record.

8. **Resize and final-size accumulator pre-sizing were tested.**

   The experiment applied several resize-related changes together:

   - `resize()` copies only the active degree rectangle when degree metadata permits it;
   - `resize()` uses a contiguous copy fast path when row stride is unchanged;
   - `Add`, `Sub`, and `AddAssign` avoid cloning or resizing operands that already match the target dimensions;
   - `AddAssign` resizes `self` directly instead of cloning it into a temporary accumulator;
   - `poly_comb!` materializes all scaled terms, computes final target dimensions, resizes each term to that target once, and then accumulates.

   Artifact:

   ```text
   timing.remote.resize-accumulator.cuda.json
   ```

   Result against `timing.remote.special-form-products.cuda.json`:

   | metric | baseline | resize-accumulator | delta |
   | --- | ---: | ---: | ---: |
   | total wall | 26.709146 s | 26.750981 s | +0.041835 s |
   | category `poly` | 18.653591 s | 18.738748 s | +0.085157 s |
   | pure MSM encode | 1.270636 s | 1.287827 s | +0.017191 s |
   | `poly.combine` | 14.007280 s | 14.028294 s | +0.021014 s |
   | `div_by_vanishing_opt` | 1.315135 s | 1.308149 s | -0.006986 s |
   | `div_by_ruffini` | 1.540679 s | 1.589633 s | +0.048954 s |
   | detail addition | 7.076283 s | 2.750574 s | -4.325709 s |
   | detail multiplication | 4.914589 s | 4.923092 s | +0.008503 s |
   | detail scaling | 0.807468 s | 0.520132 s | -0.287336 s |

   The detail-level addition time dropped sharply, but the overall `poly.combine` time did not. The final-size `poly_comb!` rewrite moved resize work out of the `AddAssign` detail span and into term preparation inside the same `poly.combine.*` scope. This is not a real end-to-end optimization.

   The experiment is useful evidence, but it should not replace the accepted performance baseline. The next viable direction is a true final-size accumulator that writes scaled terms into one output polynomial without materializing each resized term as a separate `DensePolynomialExt`.

## Current Accepted Baseline

The current accepted CUDA baseline is `timing.remote.special-form-products.cuda.json`:

- total wall: `26.709146 s`
- init: `0.740477 s`
- prove4: `9.519266 s`
- uvwXY: `0.284122 s`
- s0/s1: `0.054744 s`
- pure MSM encode total: `1.270636 s`
- pure vanishing division total: `1.315135 s`
- polynomial combination total: `14.007280 s`

Future optimization should focus on `DensePolynomialExt` wrapper-level costs rather than more algebraic polynomial-multiplication reduction. The next higher-value targets are addition/subtraction fast paths, monomial-shift/intermediate reduction, and more accurate degree metadata. Pure MSM encoding and pure vanishing division are not the dominant costs under the strict timing view.
