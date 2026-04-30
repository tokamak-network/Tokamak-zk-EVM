# Resize And Final-Size Accumulator Experiment

## Scope

This experiment applies the resize-related ideas in one batch:

- `resize()` copies only the active degree rectangle instead of the full allocated rectangle when degree metadata permits it.
- `resize()` uses a contiguous copy fast path when the row stride does not change.
- `Add`, `Sub`, and `AddAssign` avoid cloning/resizing operands that are already at the target size.
- `AddAssign` resizes `self` directly instead of cloning it into a temporary accumulator.
- `poly_comb!` first materializes all scaled terms, computes the final target dimensions, resizes each term to that target once, and then accumulates.

Artifact:

```text
prove/optimization/timing.remote.resize-accumulator.cuda.json
```

## Measurement

Comparison against `timing.remote.special-form-products.cuda.json`:

| metric | baseline | resize-accumulator | delta |
| --- | ---: | ---: | ---: |
| total wall | 26.709146 s | 26.750981 s | +0.041835 s |
| category `poly` | 18.653591 s | 18.738748 s | +0.085157 s |
| category `encode` | 1.270636 s | 1.287827 s | +0.017191 s |
| `poly.combine` | 14.007280 s | 14.028294 s | +0.021014 s |
| `poly.div_by_vanishing_opt` | 1.315135 s | 1.308149 s | -0.006986 s |
| `poly.div_by_ruffini` | 1.540679 s | 1.589633 s | +0.048954 s |
| detail addition | 7.076283 s | 2.750574 s | -4.325709 s |
| detail multiplication | 4.914589 s | 4.923092 s | +0.008503 s |
| detail scaling | 0.807468 s | 0.520132 s | -0.287336 s |

## Interpretation

The detail-level addition time dropped sharply, but this does not represent an end-to-end win. The final-size `poly_comb!` rewrite moved much of the resize work outside the `AddAssign` detail span and into term preparation inside the same `poly.combine.*` scope. As a result, `poly.combine` and total wall time were neutral to slightly worse.

This confirms that the previous `addition` detail total was partly a placement artifact: resize work was being charged to add/sub. Moving the resize earlier reduces the `addition` detail number, but not the real total cost.

Decision:

- not accepted as a performance baseline;
- useful as evidence that resize work must be removed, not merely moved out of add/sub detail spans;
- next viable direction is a true final-size accumulator that writes/scatters scaled terms into one output without materializing each resized term as a separate `DensePolynomialExt`.

# DensePolynomialExt Add/Mul Line Breakdown

## Scope

This diagnostic run instruments the internals of `DensePolynomialExt` arithmetic while a `poly.combine.*` timing scope is active.

Artifact:

```text
prove/optimization/timing.remote.poly-op-line-breakdown.cuda.json
```

This artifact is for internal cost attribution only. It is not a clean performance baseline because it records many more timing events than normal runs.

## Existing Detail Totals

| detail operation | time | count |
| --- | ---: | ---: |
| `addition` | 7.102349 s | 82 |
| `multiplication` | 4.954231 s | 9 |
| `scaling` | 0.809682 s | 86 |

## Add/Sub/AddAssign Breakdown

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
| `addassign_update_metadata` | 0.000006 s | 47 |
| `add_construct_result` | 0.000004 s | 24 |
| `sub_construct_result` | 0.000001 s | 7 |

Interpretation:

- The actual ICICLE add/sub calls are tiny: about `0.031705 s` total.
- The dominant add/sub cost is resizing operands before the operation: about `6.632659 s`.
- The previous add/sub fast-path experiment did not help because it skipped part of the clone/branch overhead, but the real cost is dimension reconciliation and intermediate growth.

## Scalar Add/Sub Breakdown

| step | time | count |
| --- | ---: | ---: |
| `scalar_sub_clone_coeffs` | 0.064137 s | 2 |
| `scalar_sub_alloc_host` | 0.055853 s | 2 |
| `scalar_sub_copy_coeffs` | 0.023964 s | 2 |
| `scalar_sub_from_coeffs` | 0.015328 s | 2 |
| `scalar_add_clone_coeffs` | 0.024802 s | 2 |
| `scalar_add_alloc_host` | 0.021036 s | 2 |
| `scalar_add_copy_coeffs` | 0.007061 s | 2 |
| `scalar_add_from_coeffs` | 0.005507 s | 2 |
| `scalar_sub_update_constant` | 0.000002 s | 2 |
| `scalar_add_update_constant` | 0.000002 s | 2 |

Interpretation:

- Scalar add/sub is not a major total cost.
- Its cost is mostly coefficient vector materialization, not the constant update itself.

## Generic Polynomial Mul Breakdown

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
| `mul_alloc_out_evals` | 0.002518 s | 9 |
| `mul_alloc_lhs_evals` | 0.001653 s | 9 |
| `mul_alloc_rhs_evals` | 0.001371 s | 9 |
| `mul_setup_vec_ops` | 0.000004 s | 9 |
| `mul_compute_target_size` | 0.000002 s | 9 |

Interpretation:

- Generic multiplication is dominated by NTT conversion and wrapper resizing.
- The element-wise evaluation multiplication itself is only `0.113471 s`.
- Exact degree work is material: `find_degree` totals `0.432713 s`, and `optimize_size` totals `0.607036 s`.
- The previous conservative-degree experiment removed some of this exact-degree work, but the end-to-end result was neutral to slightly negative because downstream polynomial sizes and combination work changed.

## Scalar Multiplication Breakdown

| step | time | count |
| --- | ---: | ---: |
| `scalar_mul_copy_coeffs` | 0.432185 s | 77 |
| `scalar_mul_icicle_scalar_mul` | 0.228732 s | 77 |
| `scalar_mul_from_coeffs` | 0.054522 s | 77 |
| `scalar_mul_alloc_output` | 0.037745 s | 77 |
| `scalar_mul_alloc_input` | 0.031187 s | 77 |
| `scalar_mul_one_clone` | 0.024800 s | 9 |
| `scalar_mul_setup` | 0.000037 s | 77 |

Interpretation:

- Scalar multiplication is mostly coefficient copying plus the ICICLE scalar multiplication.
- It is smaller than add/sub resizing and generic polynomial multiplication.

## Top Target-Level Internal Costs

| time | target | step |
| ---: | --- | --- |
| 0.632540 s | `prove2.p_comb` | `mul_lhs_to_rou_evals` |
| 0.630077 s | `prove2.p_comb` | `mul_rhs_to_rou_evals` |
| 0.610949 s | `prove4.Pi_A` | `addassign_resize_operands` |
| 0.567779 s | `prove2.p_comb` | `mul_clone_resize_rhs` |
| 0.529883 s | `prove2.Q_CX` | `addassign_resize_operands` |
| 0.471304 s | `prove2.p_comb` | `mul_clone_resize_lhs` |
| 0.424686 s | `prove4.LHS_for_copy` | `addassign_resize_operands` |
| 0.382574 s | `prove2.p_comb` | `mul_optimize_size` |
| 0.360351 s | `prove0.Q_AY` | `addassign_resize_operands` |
| 0.356754 s | `prove4.LHS_zk1` | `addassign_resize_operands` |

## Optimization Implications

The next promising direction is not replacing ICICLE add/sub or evaluation multiplication. The cost is mostly generated before and around those primitives:

- avoid repeated operand resizing in polynomial linear combinations;
- construct combination outputs at the final target size instead of growing through chained `AddAssign`;
- reduce generic multiplication input expansion and exact-degree scans only when it does not increase downstream polynomial dimensions;
- treat `prove2.p_comb`, `prove4.Pi_A`, `prove2.Q_CX`, `prove4.LHS_for_copy`, and `prove4.LHS_zk1` as the first targets.
