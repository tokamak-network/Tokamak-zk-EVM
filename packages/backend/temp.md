# DensePolynomialExt Wrapper Optimization Notes

## Background

ICICLE provides highly optimized univariate polynomial primitives. `DensePolynomialExt` extends those primitives into a bivariate polynomial abstraction by wrapping univariate polynomial storage and recombining ICICLE operations such as NTT, vector operations, scalar multiplication, and transpose.

The main optimization risk is therefore not the ICICLE primitive itself. The risk is wrapper overhead between primitive calls:

- unnecessary intermediate `DensePolynomialExt` values;
- repeated add/sub/scale calls;
- repeated clone and resize paths;
- conservative degree metadata that later forces scans or oversized work;
- wrapper-side coefficient placement work around monomial shifts and special-form products.

Previous experiments showed that directly removing host round-trips or small memory movement did not produce meaningful end-to-end improvements. Future work should not focus on copy elimination by itself. The better target is reducing the number of wrapper-level operations and intermediate polynomials while keeping the same mathematical logic.

## Current Accepted Baseline

The latest accepted CUDA timing artifact is:

```text
prove/optimization/timing.remote.special-form-products.cuda.json
```

Key values:

| metric | value |
| --- | ---: |
| total wall | 26.709146 s |
| category `poly` | 18.653591 s |
| pure MSM encode | 1.270636 s |
| `poly.combine` | 14.007280 s |
| `div_by_vanishing_opt` | 1.315135 s |
| `div_by_ruffini` | 1.540679 s |

The special-form product rewrite reduced generic multiplication detail time, but increased addition and scaling:

| detail operation | before | after | delta |
| --- | ---: | ---: | ---: |
| multiplication | 8.791025 s | 4.914589 s | -3.876436 s |
| addition | 5.720295 s | 7.076283 s | +1.355988 s |
| scaling | 0.625577 s | 0.807468 s | +0.181891 s |

This means the next target is not more generic polynomial multiplication removal. It is reducing add/sub/scale/shift and intermediate construction overhead created by the current wrapper composition.

## Findings

### 1. Add/Sub/AddAssign Have High Wrapper Overhead

Current `Add`, `Sub`, and `AddAssign` clone both operands before checking whether resizing is actually needed.

Risk:

- size-equal additions still pay clone overhead;
- `AddAssign` is not truly in-place at the wrapper level;
- frequent helper expansions now turn addition into a large measured cost.

Plan:

- add a size-equal fast path for `Add` and `Sub` that directly applies the ICICLE polynomial operation without resizing clones;
- add a size-equal fast path for `AddAssign`;
- keep the existing resize path unchanged for mismatched dimensions.

This should be the first experiment because it is narrow, low-risk, and directly targets the current `poly_detail.addition` increase.

### 2. Special-Form Helpers Create Too Many Intermediate Polynomials

The accepted special-form implementation intentionally removed generic NTT multiplication, but it expands expressions into shifted/scaled intermediate polynomials. For example:

```text
(a0 + a1 X) * P = a0*P + a1*X*P
term9 * P = c0*P + cX*X*P + cY*Y*P
```

This reduces multiplication detail time but increases addition and scaling.

Plan:

- do not revert the special-form logic;
- inspect helper-level accumulation opportunities after Add/Sub fast paths are measured;
- prefer building one output polynomial per helper when it reduces multiple wrapper calls without adding generic polynomial multiplication.

Promising targets:

- `mul_by_linear_x`;
- `mul_by_linear_y`;
- `mul_by_sparse_const_x_y`;
- `mul_by_x_minus_one`;
- `mul_by_one_minus_x`.

### 3. Monomial Shift Is Now More Important

`mul_monomial` is now used more often because special-form products are expressed through shifts.

Risk:

- general host round-trip removal has not shown meaningful wins before;
- optimizing `mul_monomial` generically may be too broad.

Plan:

- do not start with a full generic `mul_monomial` rewrite;
- consider only narrow fast paths for `mul_monomial(1, 0)` and `mul_monomial(0, 1)` after addition fast paths;
- measure whether these paths reduce the special-form helper cost.

### 4. Degree Metadata Is Too Conservative

Most constructors and operations set degree metadata to `x_size - 1` and `y_size - 1`. Later code sometimes calls `find_degree` or `optimize_size`, which may force full coefficient scans and resizing decisions.

Plan:

- keep exact degree metadata in new helper outputs where it is easy and local;
- consider operation-specific metadata updates:
  - scalar multiplication preserves degree;
  - monomial shift adds the shift to degree;
  - add/sub degree is bounded by max degree;
  - direct vanishing products have known degree from input length and exponent.

This should be treated carefully because wrong degree metadata can corrupt later sizing decisions.

### 5. Scale-Coefficient Paths Are Secondary

`scale_coeffs_x/y` rebuild scaling vectors and perform extra data preparation. However, current total scale-coeffs time is much smaller than polynomial-combination addition.

Plan:

- do not optimize this first;
- revisit only if later timing shows scale-coeffs becoming a larger share.

### 6. to_rou_evals and biNTT Are Not the Next Target

The bivariate NTT wrapper uses two batched univariate NTTs plus transposes. `to_rou_evals` also stages coefficient data before calling `_biNTT`.

These are real wrapper costs, but previous experiments suggest host round-trip elimination alone does not materially improve end-to-end timing. They also do not directly address the current post-special-form addition increase.

Plan:

- leave `_biNTT` and `to_rou_evals` unchanged for now;
- revisit only if future timing again identifies generic multiplication or ROU conversion as the dominant remaining cost.

## Next Experiment

Apply exactly one change:

```text
Add/Sub/AddAssign size-equal fast path
```

Expected effect:

- reduce `poly_detail.addition`;
- reduce clone/resize overhead in special-form helper output combinations;
- no change to polynomial multiplication count;
- no algebraic behavior change.

Verification:

1. `cargo check -p prove --features timing`
2. `cargo test --release -p prove --features timing --test timing --no-run`
3. local CPU timing correctness run if compile succeeds
4. remote CUDA timing under a new artifact name

Decision rule:

- accept if `poly_detail.addition` and total wall both improve beyond normal run-to-run noise;
- reject if addition improves but total wall is neutral or worse due to allocation or downstream effects.
