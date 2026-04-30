# Polynomial Combination Optimization Review

## Scope

This note replaces the previous temporary `div_by_vanishing_opt` CUDA-kernel plan.

The current target is every polynomial-combination expression in `prove/src/lib.rs`, not only `poly_comb!` macro calls. The review includes:

- `poly_comb!` call sites.
- Manual linear combinations such as `&A + &(&c * &B)`.
- Numerator construction for later divisions.
- Repeated polynomial construction across `prove0` through `prove4`.
- Common subexpressions that can be cached and reused.

The count below treats only generic `DensePolynomialExt * DensePolynomialExt` operations as polynomial multiplications. Scalar-polynomial multiplication, addition, subtraction, `from_rou_evals`, `scale_coeffs`, and evaluation are not counted as polynomial multiplications, although some of them may still be worth optimizing separately.

## Current Dominant Strict Timing

From `prove/optimization/timing.remote.strict.cuda.md`:

| operation | time |
| --- | ---: |
| `poly.combine.prove2.p_comb` | 4.500720 s |
| `poly.combine.prove2.Q_CY` | 1.943383 s |
| `poly.combine.prove2.Q_CX` | 1.616636 s |
| `poly.combine.prove4.LHS_zk1` | 1.326547 s |
| `poly.combine.prove4.LHS_zk2` | 1.204088 s |
| `poly.combine.prove4.Pi_A` | 0.912939 s |
| `poly.combine.prove4.LHS_for_copy` | 0.775926 s |
| `poly.combine.prove0.p0XY` | 0.617999 s |

## High-Value Algebraic Rewrites

### 1. `prove2.Q_CX`

Current shape:

```text
(rB_X * A) * D + (rR_X * A) * g_D
```

for:

```text
A = X - 1, D = r_D1
A = K0,    D = r_D2
```

Rewrite:

```text
A * (rB_X * D + rR_X * g_D)
```

Polynomial multiplication count:

| item | current | rewritten | reduction |
| --- | ---: | ---: | ---: |
| `(X - 1)` branch | 3 | 2 | 1 |
| `K0` branch | 3 | 2 | 1 |
| total | 6 | 4 | 2 |

### 2. `prove2.Q_CY`

Same structure as `Q_CX`, with `rB_Y` and `rR_Y`.

Rewrite:

```text
(X - 1) * (rB_Y * r_D1 + rR_Y * g_D)
K0      * (rB_Y * r_D2 + rR_Y * g_D)
```

Polynomial multiplication count:

| item | current | rewritten | reduction |
| --- | ---: | ---: | ---: |
| `(X - 1)` branch | 3 | 2 | 1 |
| `K0` branch | 3 | 2 | 1 |
| total | 6 | 4 | 2 |

### 3. `prove4.LHS_zk1`

Current shape:

```text
(1 - X) * (r_D1 * term9) + (chi - X) * term10
```

Use:

```text
chi - X = (1 - X) + (chi - 1)
```

Rewrite:

```text
(1 - X) * (r_D1 * term9 + term10) + (chi - 1) * term10
```

Polynomial multiplication count:

| item | current | rewritten | reduction |
| --- | ---: | ---: | ---: |
| `r_D1 * term9` | 1 | 1 | 0 |
| multiply by `1 - X` | 1 | 1 | 0 |
| `term10 * (chi - X)` | 1 | 0 | 1 |
| total | 3 | 2 | 1 |

### 4. `prove4.LHS_zk2`

Current shape:

```text
(K0 * r_D2) * (-term9) + term10 * (K0_eval - K0)
```

Rewrite:

```text
K0_eval * term10 - K0 * (r_D2 * term9 + term10)
```

Polynomial multiplication count:

| item | current | rewritten | reduction |
| --- | ---: | ---: | ---: |
| `K0 * r_D2` | 1 | 0 | 1 |
| multiply by `term9` | 1 | 1 | 0 |
| `term10 * (K0_eval - K0)` | 1 | 1 | 0 |
| total | 3 | 2 | 1 |

### 5. `prove4.Pi_A`

Current relevant terms:

```text
rW_X * (t_n_eval - t_n) + rW_Y * (t_smax_eval - t_smax)
```

Use:

```text
W_zk = rW_X * t_n + rW_Y * t_smax
```

Rewrite:

```text
t_n_eval * rW_X + t_smax_eval * rW_Y - W_zk
```

`W_zk` is already logically constructed when building `prove0.W`. It can be cached and reused by `prove4.Pi_A`.

Polynomial multiplication count inside `Pi_A`:

| item | current | rewritten with cached `W_zk` | reduction |
| --- | ---: | ---: | ---: |
| `rW_X * (t_n_eval - t_n)` | 1 | 0 | 1 |
| `rW_Y * (t_smax_eval - t_smax)` | 1 | 0 | 1 |
| total | 2 | 0 | 2 |

This does not eliminate the two multiplications needed to build `W_zk` itself in `prove0.W`; it eliminates recomputation in `Pi_A`.

### 6. `prove2.p_comb`

Current shape:

```text
p1 = (R - 1) * KL
p2 = (X - 1) * (R * G - R_omegaX * F)
p3 = K0      * (R * G - R_omegaX_omegaY * F)
```

The term `R * G` is computed twice. Cache it:

```text
RG = R * G
p2 = (X - 1) * (RG - R_omegaX * F)
p3 = K0      * (RG - R_omegaX_omegaY * F)
```

Polynomial multiplication count:

| item | current | rewritten | reduction |
| --- | ---: | ---: | ---: |
| `p1` | 1 | 1 | 0 |
| `R * G` | 2 | 1 | 1 |
| `R_omegaX * F` | 1 | 1 | 0 |
| `R_omegaX_omegaY * F` | 1 | 1 | 0 |
| outer multiplications | 2 | 2 | 0 |
| total | 7 | 6 | 1 |

An equivalent rewrite using `g_D = G - F` and `r_D1/r_D2` also saves only one polynomial multiplication, so the simple `RG` cache is the first version to test.

## Cache-Based Reuse

### 7. `term_B_zk`

Current repeated expression:

```text
term_B_zk = rB_X * t_mi + rB_Y * t_smax
```

It is built in `prove0.B` and again in `prove4.term_B_zk`.

If cached after `prove0.B`, `prove4.term_B_zk` can reuse it.

Polynomial multiplication count:

| item | current repeated work | cached | reduction |
| --- | ---: | ---: | ---: |
| `rB_X * t_mi` in `prove4` | 1 | 0 | 1 |
| `rB_Y * t_smax` in `prove4` | 1 | 0 | 1 |
| total | 2 | 0 | 2 |

### 8. `lagrange_KL_XY`

Current repeated expression:

```text
lagrange_KL_XY = lagrange_K_XY * lagrange_L_XY
```

It is built in `prove2` and again in `prove4`.

If cached from `prove2`, `prove4.KL` can reuse it.

Polynomial multiplication count:

| item | current repeated work | cached | reduction |
| --- | ---: | ---: | ---: |
| `lagrange_K_XY * lagrange_L_XY` in `prove4` | 1 | 0 | 1 |

`lagrange_K0_XY` is also repeated, but it is created with `from_rou_evals`, not polynomial multiplication. Caching it may still save small setup time but does not reduce polynomial multiplication count.

## Other Reviewed Expressions

These expressions were reviewed and do not offer meaningful generic polynomial multiplication reduction under the current APIs.

| expression group | reason |
| --- | --- |
| `prove0.U`, `prove0.V` | scalar-polynomial linear combinations only |
| `prove0.W` | builds `W_zk`; useful as cache source, but no internal reduction |
| `prove0.Q_AX`, `prove0.Q_AY` | scalar-polynomial linear combinations only; can be cosmetically rewritten using `U`, but no polynomial multiplication reduction |
| `prove0.B` | useful as `term_B_zk` cache source, but no internal reduction if `term_B_zk` must be built once |
| `prove0.p0XY` | one essential multiplication `uXY * vXY`; no common-factor reduction found |
| `prove1.R` | scalar-polynomial linear combination only |
| `prove3.VXY`, `prove3.RXY` | scalar-polynomial linear combinations only |
| `prove4.RXY`, `M_numerator`, `N_numerator`, `Pi_B_numerator` | scalar multiplication or add/sub only |
| `prove4.term5`, `prove4.term6`, `prove4.pC`, `LHS_for_copy` | scalar linear combinations; previous fused-LC style optimization was not useful |
| `prove4.term9` | scalar-polynomial only and already negligible |
| `prove4.term10` | scalar-polynomial only and already negligible |
| `fXY`, `gXY`, `g_D` | scalar-polynomial/add only; caching may save time and memory traffic but not polynomial multiplication count |
| `R_zk_terms` | scalar-polynomial only; caching may save time but not polynomial multiplication count |

## Total Polynomial Multiplication Reduction

If all algebraic rewrites and cache reuses above are applied together, the expected reduction in generic polynomial multiplication calls is:

| source | reduction |
| --- | ---: |
| `prove2.Q_CX` factorization | 2 |
| `prove2.Q_CY` factorization | 2 |
| `prove4.LHS_zk1` factorization | 1 |
| `prove4.LHS_zk2` factorization | 1 |
| `prove4.Pi_A` cached `W_zk` rewrite | 2 |
| `prove2.p_comb` cached `R * G` | 1 |
| cached `term_B_zk` reuse | 2 |
| cached `lagrange_KL_XY` reuse | 1 |
| **total** | **12** |

This `12` count is a static operation-count estimate. The actual runtime improvement may be smaller because some eliminated multiplications involve small or structured polynomials, and because caching larger intermediate polynomials increases memory residency.

## Applied Measurement

The batch was implemented and measured in `prove/optimization/timing.remote.poly-comb-algebraic.cuda.json`.

| metric | strict baseline | algebraic comb | delta |
| --- | ---: | ---: | ---: |
| total wall | 28.598577 s | 27.490122 s | -1.108455 s |
| category `poly` | 20.568262 s | 19.444623 s | -1.123639 s |
| `poly.combine` | 15.840093 s | 14.863306 s | -0.976787 s |
| `poly.mul` | 0.117172 s | 0.008618 s | -0.108554 s |
| `prove2.total` | 10.908775 s | 10.312476 s | -0.596299 s |
| `prove4.total` | 9.985713 s | 9.541593 s | -0.444121 s |

The CUDA timing test passed. Some individual targets were neutral, but the combined rewrite is positive overall.

## Detail Breakdown Measurement

`prove/optimization/timing.remote.poly-comb-detail.cuda.json` adds nested `poly_detail` events inside active `poly.combine.*` spans. These events are diagnostic only and are excluded from normal `poly` totals to avoid double-counting.

| detail operation | time |
| --- | ---: |
| multiplication | 8.791025 s |
| addition | 5.720295 s |
| scaling | 0.625577 s |

The largest detail targets are:

| target | addition | multiplication | scaling | total |
| --- | ---: | ---: | ---: | ---: |
| `prove2.p_comb` | 0.281001 s | 3.689850 s | 0.050819 s | 4.021669 s |
| `prove2.Q_CY` | 0.284850 s | 1.609415 s | 0.035909 s | 1.930174 s |
| `prove2.Q_CX` | 0.619124 s | 1.008238 s | 0.023295 s | 1.650657 s |
| `prove4.LHS_zk2` | 0.187774 s | 0.983838 s | 0.039706 s | 1.211318 s |
| `prove4.LHS_zk1` | 0.180626 s | 0.949706 s | 0.043845 s | 1.174176 s |
| `prove4.Pi_A` | 0.793005 s | 0.000000 s | 0.133940 s | 0.926945 s |
| `prove4.LHS_for_copy` | 0.674182 s | 0.000000 s | 0.109677 s | 0.783859 s |

This measurement shows that multiplication is still the largest combine component, but repeated addition and resizing are also large enough that further optimization should not focus only on multiplication count.

## Special-Form Polynomial Multiplication Inventory

This inventory uses the current code after the algebraic-combination rewrite. The detail timing run reports 23 generic `DensePolynomialExt * DensePolynomialExt` calls inside active `poly.combine.*` spans.

The directly exploitable special-form count is 18 out of 23. `lagrange_KL_XY` is not counted as a special-form multiplication. The remaining 5 multiplications are either dense-by-dense or explicitly outside the current special-form target list.

| target | expression | form | status |
| --- | --- | --- | --- |
| `prove0.W` | `rW_X * t_n` | low-degree univariate times vanishing binomial `X^n - 1` | direct special-form |
| `prove0.W` | `rW_Y * t_smax` | low-degree univariate times vanishing binomial `Y^s - 1` | direct special-form |
| `prove0.B` | `rB_X * t_mi` | degree-1 univariate times vanishing binomial `X^m - 1` | direct special-form |
| `prove0.B` | `rB_Y * t_smax` | degree-1 univariate times vanishing binomial `Y^s - 1` | direct special-form |
| `prove0.p0XY` | `uXY * vXY` | dense by dense | no special form |
| `prove2.p_comb` | `rXY * gXY` | dense by dense | no special form |
| `prove2.p_comb` | `(rXY - 1) * lagrange_KL_XY` | dense times separable boundary Lagrange product | excluded |
| `prove2.p_comb` | `r_omegaX * fXY` | dense by dense | no special form |
| `prove2.p_comb` | `(X - 1) * (...)` | binomial times dense | direct special-form |
| `prove2.p_comb` | `r_omegaX_omegaY * fXY` | dense by dense | no special form |
| `prove2.p_comb` | `lagrange_K0_XY * (...)` | univariate `K0(X)` Lagrange polynomial times dense | direct special-form, but previous CPU-loop attempt was poor |
| `prove2.Q_CX` | `rB_X * r_D1` | degree-1 univariate times dense | direct special-form |
| `prove2.Q_CX` | `(X - 1) * d1_comb` | binomial times dense | direct special-form |
| `prove2.Q_CX` | `rB_X * r_D2` | degree-1 univariate times dense | direct special-form |
| `prove2.Q_CX` | `lagrange_K0_XY * d2_comb` | univariate `K0(X)` Lagrange polynomial times dense | direct special-form, but needs non-CPU-loop implementation |
| `prove2.Q_CY` | `rB_Y * r_D1` | degree-1 univariate times dense | direct special-form |
| `prove2.Q_CY` | `(X - 1) * d1_comb` | binomial times dense | direct special-form |
| `prove2.Q_CY` | `rB_Y * r_D2` | degree-1 univariate times dense | direct special-form |
| `prove2.Q_CY` | `lagrange_K0_XY * d2_comb` | univariate `K0(X)` Lagrange polynomial times dense | direct special-form, but needs non-CPU-loop implementation |
| `prove4.LHS_zk1` | `r_D1 * term9` | dense times sparse low-degree `term9` | direct special-form |
| `prove4.LHS_zk1` | `(1 - X) * (...)` | binomial times dense | direct special-form |
| `prove4.LHS_zk2` | `r_D2 * term9` | dense times sparse low-degree `term9` | direct special-form |
| `prove4.LHS_zk2` | `lagrange_K0_XY * (...)` | univariate `K0(X)` Lagrange polynomial times dense | direct special-form, but needs non-CPU-loop implementation |

Count summary:

| category | count | share |
| --- | ---: | ---: |
| direct special-form candidates | 18 | 78.3% |
| excluded (`lagrange_KL_XY`) | 1 | 4.3% |
| dense-by-dense, no obvious shortcut | 4 | 17.4% |
| total generic polynomial multiplications in `poly.combine` spans | 23 | 100.0% |

Special-form breakdown:

| form | count |
| --- | ---: |
| vanishing binomial or simple binomial times polynomial | 8 |
| degree-1 or low-degree univariate times polynomial | 4 |
| `lagrange_K0_XY` times polynomial | 4 |
| sparse low-degree `term9` times polynomial | 2 |

The previous rejected special-multiplication attempt used CPU-side loops for some of these forms. The inventory suggests the idea is still worth revisiting only if the implementation is built from existing GPU-backed polynomial APIs or a dedicated GPU path. The most attractive direct targets are the binomial and low-degree univariate cases, because they can be expressed as a small number of shifts, scalings, and additions.

## Suggested Application Order

1. Apply `Q_CX/Q_CY` factorization.
2. Apply `LHS_zk1/LHS_zk2` factorization.
3. Add `W_zk` cache and rewrite `Pi_A`.
4. Cache `R * G` in `prove2.p_comb`.
5. Cache `term_B_zk`.
6. Cache `lagrange_KL_XY`.
7. Consider `fXY/gXY/g_D`, `R_zk_terms`, and `lagrange_K0_XY` only after measuring memory impact, because they do not reduce generic polynomial multiplication count.
