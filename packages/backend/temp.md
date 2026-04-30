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

## Suggested Application Order

1. Apply `Q_CX/Q_CY` factorization.
2. Apply `LHS_zk1/LHS_zk2` factorization.
3. Add `W_zk` cache and rewrite `Pi_A`.
4. Cache `R * G` in `prove2.p_comb`.
5. Cache `term_B_zk`.
6. Cache `lagrange_KL_XY`.
7. Consider `fXY/gXY/g_D`, `R_zk_terms`, and `lagrange_K0_XY` only after measuring memory impact, because they do not reduce generic polynomial multiplication count.
