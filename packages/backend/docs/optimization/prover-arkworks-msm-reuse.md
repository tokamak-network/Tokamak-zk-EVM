# Native prover MSM precomputation experiment

## Result

For backend maintainers evaluating CPU prover optimizations: the experiment
retained the then-current stock arkworks MSM. The tested base-precomputation candidates increase total time at
three and four uses of the same CRS prefix. A twofold base table reduces warm
MSM time by approximately 11%, but its construction costs more than those uses
save. No production arithmetic or artifact format was changed.

This is an independent primitive experiment, not a new whole-proof timing or
E2E result. It does not rule out other precomputation algorithms.

The later [consolidated prover report](current-univariate-crs.md#current-prover-implementation-and-evidence-inventory)
records the accepted signed-window CPU kernel. That kernel uses arkworks group
operations but is not the stock API measured here. This report's negative
base-table result remains valid for its controls; it is not an instruction to
revert the later kernel. No precomputed base table was added by that change.

## Method

The [benchmark](../../rust/prove/examples/msm_reuse_benchmark.rs) uses arkworks
0.5.0, a release build with the `timing` feature, and the default Rayon pool
(14 threads on an Apple M4 Pro). The
[measurement record](evidence/prover-arkworks-msm-reuse.json) contains every
sample, input/source/binary hashes, compiler version, and summary statistics.
One warmup per variant is discarded; three subsequent trials rotate variant
order. Cases and MSMs are sequential, with no concurrent task-owned build or
benchmark. Normal desktop applications are not controlled.

Actual `tau_sequence.rkyv` points supply two representative workloads:

- `sxi_g1`: 262,146 bases reused three times, modeling the overlapping prefix
  used by `C_L`, `C_H`, and `Pi_chi`.
- `s0_g1`: 262,149 bases reused four times, modeling the large overlapping
  prefix used by `C_R`, `C_Q`, `Pi_chi`, and `Pi_plus`.

The benchmark uses equal-length prefixes with distinct seeded dense random
scalar vectors, not captured protocol scalars. Actual commitment lengths vary
slightly, and actual commitments can combine multiple CRS sources. It does not
split or replace those production MSMs. An additional 1,024-base, three-use
case checks small-input behavior. `spsi_g1` is not separately measured.

The precomputed table stores `P_j`, `[2^b]P_j`, and further shifts, where
`b = ceil(255 / factor)` and factor is 2 or 4. Each scalar is split into that
many segments; combining segments against shifted bases preserves the original
MSM. Only the bases are precomputed. Scalar-dependent buckets are rebuilt.

Two kernels consume the table:

- **Stock:** arkworks `msm_bigint`; the factor-one baseline calls the current
  prover's `msm` API. Stock arkworks still processes its full field bit width.
- **Bounded:** a test-only unsigned-window Pippenger built from arkworks group
  operations, processing only the segment bit width. Its factor-one control
  separates a kernel change from base-precomputation benefit. This is not an
  exposed arkworks precomputation option or a production implementation.

Table construction includes allocation, the original-base copy, point
doubling, and batch normalization. Warm MSM includes scalar conversion or
splitting, MSM arithmetic, and affine output. Total time includes construction
and all sequential uses. CRS decoding, scalar generation, correctness checks,
and final table destruction are outside these intervals for all variants.

## Measurements

All values are arithmetic means of three retained trials, in seconds. Warm
MSM is the mean of the three or four individual uses after table construction.
The factor is table expansion, not a speedup.

| Prefix / uses | Kernel | Factor | Build table | Warm MSM / use | Total including build | Total range |
|---|---|---:|---:|---:|---:|---:|
| xi / 3 | Stock | 1 | — | 0.229 | 0.688 | 0.670–0.716 |
| xi / 3 | Stock | 2 | 0.679 | 0.204 | 1.292 | 1.277–1.308 |
| xi / 3 | Stock | 4 | 1.027 | 0.411 | 2.261 | 2.254–2.270 |
| xi / 3 | Bounded | 1 | — | 0.247 | 0.741 | 0.729–0.752 |
| xi / 3 | Bounded | 2 | 0.671 | 0.227 | 1.352 | 1.348–1.354 |
| xi / 3 | Bounded | 4 | 1.021 | 0.448 | 2.365 | 2.359–2.371 |
| ordinary / 4 | Stock | 1 | — | 0.225 | 0.900 | 0.887–0.917 |
| ordinary / 4 | Stock | 2 | 0.693 | 0.200 | 1.495 | 1.466–1.530 |
| ordinary / 4 | Stock | 4 | 1.079 | 0.418 | 2.752 | 2.694–2.852 |
| ordinary / 4 | Bounded | 1 | — | 0.258 | 1.030 | 0.987–1.110 |
| ordinary / 4 | Bounded | 2 | 0.678 | 0.220 | 1.557 | 1.533–1.586 |
| ordinary / 4 | Bounded | 4 | 1.027 | 0.447 | 2.815 | 2.795–2.834 |

The fastest precomputed candidate, stock factor two, increases total time by
87.7% for the three-use case and 66.0% for the four-use case. Its allocated
affine table occupies about 52 MiB, versus about 104 MiB at factor four;
these numbers exclude temporary projective points, digits, and MSM buckets.
No memory cap is imposed.

At 1,024 bases and three uses, stock factor one takes 5.06 ms total. Stock
factors two and four take 8.56 ms and 11.30 ms. Bounded factors one, two, and
four take 5.57 ms, 8.72 ms, and 11.16 ms. No candidate wins there either.

Every result matches stock arkworks exactly. Independent edge cases cover
all-zero, one, minus-one, and random scalars, including infinity and duplicate
bases, for every factor and both kernels.

## Interpretation and decision

For stock factor two, estimated break-even reuse is
`ceil(table_build / (baseline_MSM - warm_precomputed_MSM))`: 27 uses for xi
and 29 for ordinary. These are extrapolations from short runs, not measured
long-lived prover results. The current one-proof CLI does not preserve a table
across invocations, and three or four uses do not recover the measured cost.

The bounded kernel does not improve the decision: its factor-one control is
slower than stock, and its precomputed variants also lose on total time. The
experiment does not isolate why factor four is slower; a shorter scalar alone
does not guarantee a faster MSM when base count and window work also change.

Trusted setup's successful optimization is different: one fixed generator's
table serves many scalar multiplications. Here there are hundreds of thousands
of distinct bases, and preparing each shifted base costs curve arithmetic.

Do not adopt these candidates for the current single-proof path. Do not change
the CRS format, introduce persistent tables, or infer whole-prover performance
from this benchmark. A long-lived proving workload or a different algorithm
would require its own measurement, including initialization cost and correctness.

## Reproduction

From `packages/backend`, with the same local CRS available:

```sh
cargo build --locked --release -p prove --features timing --example msm_reuse_benchmark
target/release/examples/msm_reuse_benchmark TAU_FILE xi 1024 3 3
target/release/examples/msm_reuse_benchmark TAU_FILE xi 262146 3 3
target/release/examples/msm_reuse_benchmark TAU_FILE ordinary 262149 4 3
```

Use the repository's platform-specific native-library environment when needed.
The recorded macOS runs set `DYLD_LIBRARY_PATH` to `external-lib/mac/lib` and
used the isolated target directory recorded in the evidence. The benchmark
does not initialize an ICICLE device and does not measure CUDA.
