# ICICLE and arkworks: native prover primitive comparison

## Audience and scope

This report is for backend engineers choosing implementations for the current
univariate prover. It compares individual operations, not whole-proof timing.
Production dispatch, protocol, CRS, preprocess and verifier implementations were
unchanged by this experiment. Later CPU/GPU separation and prover optimizations
are recorded in the [consolidated report](current-univariate-crs.md#current-prover-implementation-and-evidence-inventory).
The ICICLE-to-arkworks conversion boundary measured here is historical, not
the current arkworks-native CPU pipeline. The experiment is independent of the earlier fixed-base setup
encoding comparison: variable-base MSM returns one sum, not one point per scalar.

**Result:** ICICLE is not uniformly faster on this CPU. arkworks wins the
prepared-input MSM comparisons and several coefficient-to-coefficient polynomial
products. General division is much closer. For division by a vanishing
polynomial, the existing native coefficient recurrence remains cheaper at the
current ICICLE-field boundary than conversion to arkworks or the ICICLE
polynomial division API.

## Method and reproducibility boundary

Measurements were collected on 2026-09-11 with release optimization, rustc
1.95.0, Apple M4 Pro (14 logical CPUs), ICICLE 3.8.0 CPU, and arkworks 0.5.0.
arkworks' parallel features were explicitly enabled as benchmark-only dev
dependencies. Rayon selected 14 workers automatically. ICICLE used default
CPU provider configurations; no external parallel loop surrounded an ICICLE
bulk operation. No CUDA execution, fixed core-count tuning, per-base MSM
precomputation, or production library replacement was performed.

The [benchmark](../../rust/libs/examples/prover_primitive_benchmark.rs) uses
deterministic full-width BLS12-381 scalar coefficients derived from SHA-256,
with the same mathematical inputs for both libraries. MSM uses actual CRS
ordinary/xi/psi prefixes; its first three scalars are zero, one and minus one.
These are reproducible dense operation inputs, not a replay of every scalar
from an actual proof. Small inputs and sizes near the current n*s = 262,144
domain are covered. The largest MSM concatenates three 262,146-point source
prefixes. Both masked-product shapes 262,146 x 262,146 and
262,148 x 262,144 are tested.

There is one warm-up per case and candidate, excluded from the medians, followed
by six measured runs with rotated ordering. Input polynomial objects are
recreated on each call, so one library does not receive a previously cached
transform while the other receives fresh coefficients. Comparators are run
sequentially; no concurrent benchmark or deliberate build runs during timing.
Every result is checked outside the timer against all coefficients, or the
complete affine MSM result. General division checks quotient and remainder.
Specialized vanishing cases are constructed exactly divisible.

The [raw evidence](evidence/current-univariate-primitives.jsonl) preserves all
final-build samples, warm-ups, an independent same-binary MSM repeat and earlier
exploratory samples. Tables use the final build's first complete sequence;
nothing is removed from those six-run groups. The preliminary executable was
revised to avoid unused denominator construction for specialized vanishing
division and to use a monic linear divisor. Its observations are not pooled
with the final build. Executable, benchmark source and CRS SHA-256 identities
are recorded in the evidence header.

### What each timer includes

Each table cell below is **API kernel / boundary total**, in milliseconds,
reported as separate medians.

- Preparation constructs fresh library inputs. For arkworks this includes
  conversion from ICICLE scalar/point records, using Rayon, and polynomial
  construction. The ICICLE MSM already receives its native host arrays.
- The kernel timer covers the public arithmetic call and its allocations.
  MSM also includes conversion of the single projective result to affine.
- Output timing materializes coefficient arrays or converts arkworks fields
  back to ICICLE fields. ICICLE polynomial output may retain evaluations;
  copying coefficients can require a transform. Therefore polynomial kernel
  times alone do **not** establish equal coefficient-output readiness.
- Boundary total is preparation + kernel + output. Validation, source input
  generation, CRS reading/decoding, global NTT-domain initialization, process
  startup and object destruction are excluded. Independently computed medians
  of components need not sum to the median total.

The field boundary reflects the current prover but is not necessarily the
lowest possible conversion cost. Inputs already retained in arkworks or a
pipeline retaining ICICLE evaluations would have different costs. Small-input
Rayon conversion overhead is visible rather than hidden.

## Direct API results

For polynomial rows, counts denote coefficients, **not degrees**. The
vanishing rows use N = denominator count - 1. General division with a
two-coefficient denominator is division by a monic Z-a. Dense balanced general
division is measured through 4,096 / 2,048 coefficients; no full-domain
balanced-division result is claimed.

| Operation | Input coefficient / point counts | ICICLE API, ms | arkworks API, ms |
| --- | --- | ---: | ---: |
| divide-general | 16 / 8 | 0.010 / 0.013 | 0.005 / 0.172 |
| divide-general | 256 / 128 | 0.323 / 0.325 | 0.297 / 0.761 |
| divide-general | 4096 / 2048 | 81.593 / 81.616 | 79.130 / 80.173 |
| divide-general | 262148 / 2 | 16.572 / 17.379 | 16.755 / 38.958 |
| divide-vanishing | 512 / 257 | 0.903 / 0.907 | 0.036 / 0.279 |
| divide-vanishing | 515 / 257 | 6.014 / 6.021 | 0.053 / 0.280 |
| divide-vanishing | 2048 / 1025 | 1.307 / 1.312 | 0.058 / 0.427 |
| divide-vanishing | 2051 / 1025 | 7.623 / 7.638 | 0.086 / 0.526 |
| divide-vanishing | 524288 / 262145 | 47.057 / 47.629 | 0.767 / 38.519 |
| divide-vanishing | 524291 / 262145 | 722.174 / 723.214 | 0.768 / 43.396 |
| msm-g1 | 17 | 1.278 / 1.280 | 0.293 / 0.494 |
| msm-g1 | 256 | 1.562 / 1.565 | 0.766 / 1.044 |
| msm-g1 | 1024 | 3.060 / 3.064 | 1.615 / 2.306 |
| msm-g1 | 262146 | 311.973 / 311.981 | 219.335 / 328.269 |
| msm-g1 | 786438 | 857.880 / 857.887 | 638.230 / 888.725 |
| multiply | 16 / 16 | 1.456 / 1.466 | 0.089 / 0.248 |
| multiply | 256 / 256 | 1.566 / 1.666 | 0.719 / 0.987 |
| multiply | 1024 / 1024 | 2.074 / 2.487 | 2.272 / 2.762 |
| multiply | 262146 / 262146 | 128.654 / 194.824 | 107.909 / 148.296 |
| multiply | 262148 / 262144 | 127.964 / 196.882 | 101.687 / 138.026 |

### MSM: arithmetic win does not guarantee a boundary win

For 262,146 points, final-build median kernel times are 311.973 ms ICICLE and
219.335 ms arkworks. Including conversion changes the medians to 311.981 ms
and 328.269 ms. In the independent same-binary repeat, these totals are
309.857 ms and 282.557 ms.

For 786,438 points, first-run totals are 857.887 ms and 888.725 ms; repeated
totals are 851.002 ms and 828.748 ms. The repeat retains the arkworks kernel
advantage (636.449 ms versus 850.998 ms), but conversion-sensitive total
ordering changes. The cause of the cross-process conversion-time variation
was not isolated. It would be incorrect to promise a whole-prover gain by
switching the existing MSM call unconditionally.

### Multiplication: size and representation matter

At 1,024 / 1,024 coefficients, ICICLE's boundary median is 2.487 ms versus
2.762 ms for arkworks. At 262,146 / 262,146, the ordering reverses:
194.824 ms versus 148.296 ms. ICICLE's output materialization alone has a
66.029 ms median in that larger case. This cost is relevant when coefficients
are required but cannot be charged repeatedly to a pipeline that deliberately
retains evaluations between operations.

### General division: similar arithmetic, different conversion cost

At 4,096 / 2,048 coefficients, kernel medians are 81.593 ms ICICLE and
79.130 ms arkworks. At 262,148 / 2, they are 16.572 ms and 16.755 ms.
The latter boundary totals are 17.379 ms and 38.958 ms: input conversion is
material even when the arithmetic times are similar.

These rows compare generic division APIs. The current prover's opening
routine uses a direct Ruffini recurrence, not either generic division API;
these rows are not timing measurements of that complete opening routine.

## Vanishing division: compare the required operation, not just the library

ICICLE `div_by_vanishing` returns only a quotient and assumes exact
divisibility. arkworks `divide_by_vanishing_poly` returns both quotient and
remainder. Thus their API rows have different output guarantees: the ICICLE
timing does not include an admission/remainder check and cannot replace the
native exact-division check on that evidence alone.

A third candidate executes the same ICICLE-field coefficient recurrence as
the native prover. It performs q[i-N] = r[i], r[i-N] += r[i], clears the high
coefficient and returns the remainder. This is a host arithmetic comparison,
**not** an ICICLE bulk polynomial API. It excludes the native caller's
polynomial extraction, reconstruction and rejection scan.

| N | Numerator coefficients | ICICLE polynomial API total, ms | arkworks specialized API total, ms | Existing coefficient recurrence total, ms |
| --- | ---: | ---: | ---: | ---: |
| 256 | 512 | 0.907 | 0.279 | 0.004 |
| 256 | 515 | 6.021 | 0.280 | 0.004 |
| 1,024 | 2,048 | 1.312 | 0.427 | 0.013 |
| 1,024 | 2,051 | 7.638 | 0.526 | 0.013 |
| 262,144 | 524,288 | 47.629 | 38.519 | 3.261 |
| 262,144 | 524,291 | 723.214 | 43.396 | 3.192 |

For the larger masked case, arkworks' kernel median is only 0.768 ms, but
conversion raises its total to 43.396 ms. The current field-native recurrence
avoids that conversion. ICICLE's v3.8 polynomial implementation distinguishes
the 2N storage case from a general coset-NTT/vector-division path. Moving from
524,288 to 524,291 coefficients crosses a power-of-two storage boundary and
selects the latter. The observed 47.629 to 723.214 ms change is specific to
these inputs and this implementation, not evidence that three coefficients
intrinsically require fifteen times more arithmetic.

Implementation references: [ICICLE v3.8 default polynomial backend](https://github.com/ingonyama-zk/icicle/blob/v3.8.0/icicle/include/icicle/polynomials/default_backend/default_poly_backend.h),
[arkworks v0.5 dense polynomials](https://github.com/arkworks-rs/algebra/blob/v0.5.0/poly/src/polynomial/univariate/dense.rs)
and [arkworks v0.5 variable-base MSM](https://github.com/arkworks-rs/algebra/blob/v0.5.0/ec/src/scalar_mul/variable_base/mod.rs).
The locally cached sources for those versions were inspected for this comparison.

## Interpretation and limitations

The results justify operation-specific candidates, not a blanket library
replacement. Large CPU MSM and multiplication deserve end-to-end comparison
before adoption. General division provides no substantial measured arithmetic
win at the tested larger shapes. The native specialized vanishing recurrence
should not be replaced by a generic library choice based on brand or on kernel
time without its conversion boundary.

All 276 final-build measured calls and 46 warm-ups matched their mathematical
results. The independent MSM repeat adds 60 measured calls and 10 warm-ups,
also equal. The release `univariate_math` integration suite passed all four
tests with the benchmark dev features enabled. This does not establish protocol verification, whole-prover
speedup, full-size balanced general division, all possible operand sparsities,
globally optimal library parameters, or CUDA performance. Production code
remains unchanged, and no E2E claim is made.

## Reproduce

Run from `packages/backend` with the local ICICLE installation:

```sh
cargo build --locked --release -p libs --example prover_primitive_benchmark
export DYLD_LIBRARY_PATH="$PWD/external-lib/mac/lib"
export ICICLE_BACKEND_INSTALL_DIR="$PWD/external-lib/mac/lib/backend"
target/release/examples/prover_primitive_benchmark divide TAU_FILE 6
target/release/examples/prover_primitive_benchmark msm TAU_FILE 6
target/release/examples/prover_primitive_benchmark multiply TAU_FILE 6
target/release/examples/prover_primitive_benchmark msm TAU_FILE 6
```

The measured tau input was
`/tmp/tokamak-setup-compute-mZ3UVZ/accepted-1/tau_sequence.rkyv`.
The commands emit JSON lines with warm-up flags, equality checks and all
component timings. The default NTT domain is initialized to 2^22 outside
timing; no per-operation domain recreation is charged.
