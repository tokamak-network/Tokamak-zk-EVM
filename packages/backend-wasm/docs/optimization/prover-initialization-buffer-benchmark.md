# Prover Initialization Buffer Benchmark

## Audience

This report is for backend-wasm maintainers and performance engineers deciding
which initialization-buffer candidates should proceed to production promotion.

## Scope

The benchmark covers four current production patterns:

1. permutation evaluation construction through large JavaScript arrays;
2. element-wise bivariate polynomial resize;
3. scalar ffjavascript degree scans;
4. sparse-witness zero tests and writes.

The selection results are medians of three measured Node runs after one untimed
run. All candidates use the same ffjavascript runtime and exact byte inputs as
their baseline.

## Results

### Permutation Evaluation Buffers

The real permutation contains 5,053 overrides. Each output polynomial contains
1,048,576 field elements.

| Technique | Elapsed | Result |
| --- | ---: | --- |
| Two JavaScript field-reference arrays, then concatenate | 87.24 ms | Baseline |
| Allocate final row-major buffers and write directly | 17.22 ms | 5.07x faster |

Both 32 MiB evaluation buffers matched byte-for-byte. The direct candidate
also avoids two temporary 1,048,576-entry JavaScript reference arrays. Assuming
eight-byte references, those arrays alone represent about 16 MiB before engine
array metadata.

### Polynomial Resize

| Shape | Element-wise baseline | Row-prefix copy | Speedup |
| --- | ---: | ---: | ---: |
| `4096x256` to `8192x512` | 49.39 ms | 10.64 ms | 4.64x |
| `4096x256` to `2048x128` | 11.29 ms | 0.64 ms | 17.77x |
| `4096x256` to same shape | 0.83 ms | 0.83 ms | 1.01x |

All coefficients matched byte-for-byte. Both paths allocate the same final
buffer. The candidate replaces one temporary subarray and one bounds-checked
field write per copied coefficient with one contiguous prefix copy per row.

### Degree Scans

| `4096x256` case | Scalar ffjavascript | Raw aligned words | Speedup |
| --- | ---: | ---: | ---: |
| Dense | 0.0013 ms | 0.0013 ms | 1.03x |
| Trailing zero half | 33.44 ms | 2.84 ms | 11.75x |
| All zero | 222.92 ms | 19.48 ms | 11.44x |

All degree pairs matched. This reproduces the historical conclusion: raw scans
win on long zero regions but provide no material dense-path benefit. Current
production degree call sites are not proven to spend meaningful wall time on
the synthetic trailing/all-zero cases, so this candidate remains ineligible
without call-site timing evidence.

### Sparse-Witness Zero Handling

The real setup produces only 6,820 assignments in the relevant `bXY` range.

| Density | ffjavascript `isZero` | Raw conditional | Unconditional write |
| --- | ---: | ---: | ---: |
| 0% | 0.970 ms | 0.226 ms | 0.416 ms |
| 10% | 0.899 ms | 0.426 ms | 0.550 ms |
| 50% | 1.106 ms | 0.401 ms | 0.492 ms |
| 100% | 0.776 ms | 0.495 ms | 0.517 ms |
| Actual fixture | 0.762 ms | 0.479 ms | 0.503 ms |

All output buffers matched byte-for-byte. Raw conditional scanning wins every
case, but the actual-fixture reduction is only about 0.28 ms. Unconditional
writes never beat raw conditional scanning and are rejected.

## Memory Interpretation

Permutation direct construction materially removes the two large JavaScript
reference arrays. Resize, degree scan, and sparse-witness candidates do not
change the required output-buffer size. Their differences are short-lived
views, scalar WASM calls, or byte scans. The synchronous operations complete
too quickly for reliable external peak-RSS sampling, so this report does not
invent a process peak from interval samples that cannot run while JavaScript is
blocked.

## Promotion Status

- **Promoted in `86189e69`:** direct row-major permutation evaluation buffers.
- **Promoted in `35542a4f`:** row-prefix polynomial resize for different shapes.
- **Not eligible without call-site evidence:** raw degree scan.
- **Not eligible:** raw sparse-witness scan, because the real end-to-end
  opportunity is below one millisecond.
- **Rejected:** unconditional sparse-witness writes.

The two eligible boundaries were promoted in separate commits. The permutation
path now allocates its two final 32 MiB buffers directly and does not create two
1,048,576-entry JavaScript reference arrays. Polynomial resize now copies one
contiguous coefficient prefix per retained row.

After both promotions, the fixed-taxonomy run completed in `118.53 s` total
wall with `114.19 s` prover-stage total and `2.57 s` init. The preceding
accepted run was `119.40 s` total wall, `114.92 s` prover-stage total, and
`2.70 s` init. Chromium generated the proof in `120.18 s` and verified it in
`20 ms`.

Strict type checks, operation-level byte parity, polynomial parity, native
testing-mode invariants, Node verifier acceptance, and Chromium verifier
acceptance passed. Candidate-only code and its package command were removed
after the evidence was preserved here.
