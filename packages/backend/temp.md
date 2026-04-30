# Conservative Degree Bound Experiment

## Goal

Use complete conservative theoretical degree bounds instead of exact degree discovery and runtime shrinking.

Scope:

- remove runtime `optimize_size` use from prove encode/division paths;
- keep `optimize_size()` only as a compatibility no-op;
- avoid `find_degree()` in hot polynomial arithmetic paths;
- propagate upper-bound degree metadata through add/sub, scalar operations, multiplication, monomial shifts, `div_by_vanishing_opt`, and `div_by_ruffini`.

## Implementation Summary

Changed `DensePolynomialExt` so hot operations preserve or derive degree upper bounds:

- add/sub/add-assign: `max(lhs_degree, rhs_degree)`;
- scalar multiplication: preserve input degree;
- scalar add/sub: `max(input_degree, 0)`;
- `scale_coeffs_x/y`: preserve input degree;
- generic multiplication: use stored degree metadata and set output degree to degree sums;
- `mul_monomial`: copy only the active metadata rectangle and add the shift to degree bounds;
- vanishing division and Ruffini division: set quotient degree bounds from numerator and denominator metadata;
- fixed vanishing polynomials such as `t_n`, `t_mi`, and `t_smax`: set known theoretical degrees at construction time;
- encode/division call sites no longer call `optimize_size()`.

`find_degree()` remains available as an explicit diagnostic/helper method, but it is no longer part of the prove hot path.

## Measurement

Artifact:

```text
prove/optimization/timing.remote.conservative-degree.cuda.json
```

Comparison against the previous `timing.remote.special-form-products.cuda.json` baseline:

| metric | special-form baseline | conservative-degree | delta |
| --- | ---: | ---: | ---: |
| total wall | 26.709146 s | 26.825371 s | +0.116225 s |
| category `poly` | 18.653591 s | 18.698461 s | +0.044871 s |
| category `encode` | 1.270636 s | 1.262955 s | -0.007681 s |
| `poly.combine` | 14.007280 s | 14.024680 s | +0.017400 s |
| `poly.div_by_vanishing_opt` | 1.315135 s | 1.316781 s | +0.001646 s |
| `poly.div_by_ruffini` | 1.540679 s | 1.576574 s | +0.035894 s |
| detail addition | 7.076283 s | 7.077973 s | +0.001690 s |
| detail multiplication | 4.914589 s | 4.933451 s | +0.018862 s |
| detail scaling | 0.807468 s | 0.808720 s | +0.001253 s |

## Decision

This is not a performance win. The exact degree scan and shrink path was not a meaningful bottleneck in the measured prove workload, and conservative bounds were neutral to slightly negative.

The policy is kept in the branch because the current direction explicitly prefers theoretical upper bounds and removal of runtime shrinking. If pure wall-clock performance becomes the priority again, the conservative-degree patch should be compared against and possibly reverted to the `timing.remote.special-form-products.cuda.json` state.

## Next Focus

The remaining dominant cost is still `poly.combine`.

Useful next directions:

- reduce the number of add/sub/scale operations created by special-form helpers;
- reduce intermediate `DensePolynomialExt` construction without adding generic polynomial multiplication;
- consider target-specific helper accumulation only where it removes multiple wrapper operations at once.
