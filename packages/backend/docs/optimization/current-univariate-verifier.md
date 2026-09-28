# Current-protocol native verifier: fixed-input qualification

This record is for backend maintainers evaluating the build/runtime boundary
and subsequent verifier optimizations. It concerns the current univariate
protocol, not historical bivariate benchmarks or WASM performance.

## Scope and result

Only public inputs, proof and preprocess are dynamic. The build admits the
selected verifier keys and library geometry, generates typed field/point
constants, and prepares fixed G2 lines and G1 multiplication tables. Online
verification no longer opens verifier-key files. `releaseEligible` is not an
online gate. No proof, preprocess or CRS serialization format changed.

The existing local trusted-setup keys and native proof/preprocess fixture
passed verification after each retained change. Tampering with all ten proof
points, all seven evaluations, all three preprocess operands, public values
and binary lengths was rejected. Independent tests check prepared G2 lines
against arkworks, generated G1 tables, interpolation, unequal-domain U32 and
the algebraic factoring of the first U35 operand. Missing build-key environment
input fails Cargo with an explicit diagnostic; malformed, zero and
wrong-subgroup fixed keys fail build admission.

## Independent arithmetic experiment

Apple M4 Pro, Rust 1.95.0, arkworks 0.5.0, release optimization, 2026-09-12.
The test uses 256 deterministic full-width scalars per round, six rounds,
excluding round zero from these means. Precomputation is outside the timed
loops. G1 table evaluation includes the standard API's result allocation and
affine normalization. GT direct evaluation uses arkworks' cyclotomic scalar
multiplication, not generic target-field exponentiation.

| Operation | Mean per scalar (µs) | Decision |
| --- | ---: | --- |
| Direct fixed G1 multiplication | 88.158 | Comparison baseline |
| Precomputed fixed G1 table | 27.671 | Retained, subject to complete verification measurement |
| Fixed GT cyclotomic exponentiation | 389.687 | Rejected |
| Precomputed fixed GT table | 174.715 | Rejected |

Moving the three fixed G1 contributions into precomputed pairing bases would
not remove any of the five pairing operands: their first G1 operand still
contains dynamic proof and preprocess contributions. The measured GT methods
cost more than the G1 tables they would replace. No GT branch was retained.

Reproduce the primitive experiment using `verify/tests/fixed_arithmetic.rs`:

```sh
cargo test --locked --release -p verify --test fixed_arithmetic -- --ignored --nocapture
```

Set `TOKAMAK_VERIFIER_KEYS` and native dependency loader paths before building.

## Complete native verification experiment

The same real proof, preprocess, instance and trusted-setup keys were used for
all three executables. Each executable ran in a separate process. The order
rotated between variants; five warm-up runs per variant were excluded, then
100 runs per variant were measured. All 315 executions returned `true`.
The executable received only dynamic file paths, and no key/library environment
variables. Existing source files were not deleted or hidden for this test.

A separate macOS sandbox run denied all file reads in the CRS and local QAP
directories. Control reads of `verifier_keys.rkyv` and `setupParams.json`
failed with `Operation not permitted`, while verification still returned
`true`. The native library-loader path remained available.

| Variant | Input + verification mean (ms) | Median (ms) | Process wall mean (ms) |
| --- | ---: | ---: | ---: |
| Fixed inputs and G2 preparation embedded; ordinary G1 multiplication | 3.58870 | 3.583 | 11.83416 |
| Also embed G1 tables | 3.56389 | 3.560 | 11.80597 |
| Also combine fixed-base scalar coefficients before U35 | 3.54190 | 3.552 | 11.70928 |

The final variant reduced this run's internal mean by about 1.3%; this is a
small improvement, not a large verifier speedup. Ranges overlap (3.392–3.904,
3.373–3.871 and 3.310–3.822 ms respectively). Process launch and dynamic-library
loading dominate the wall-clock measurement. The policy benefit is that fixed
input admission and preparation are not repeated online. No cross-machine
performance guarantee is inferred from these measurements.

The fixed-G1-only candidate also passed an earlier alternating 30-run check:
3.65177 ms without tables versus 3.59477 ms with tables. Both comparisons
include copying the generated tables into arkworks' owned containers. Tables
and coefficient factoring were retained; the source uses no runtime table
generation.

Fixture locations for the recorded local run:

- Keys: `/tmp/tokamak-common-provenance-RcwVRq/crs/verifier_keys.rkyv`.
- Preprocess: `/tmp/tokamak-verify-p6-f9sWBx/preprocess/univariate_verifier_preprocess.bin`.
- Proof: `/tmp/tokamak-verify-p6-f9sWBx/proof/univariate_proof.bin`.
- Instance: `packages/backend/tmp/current-local-fixture/instance.json`.

These local artifacts are not published benchmark fixtures. The executable
and tests accept replacement paths to matching current-protocol artifacts.

## Installation qualification and limits

CLI tests exercise version folders, checked verifier-key download before the
build callback, verifier-only installation without tau access, full setup with
digest-selected shared tau, cache reuse, corrupt-key rejection, build identity
matching and failure-safe activation. Native and Docker install arguments use
`--no-full-setup`; the retired flag is rejected. The CLI package's static
vendoring check includes the common CRS crate and verifier build sources.

The current-protocol subcircuit library is published as
`@tokamak-zk-evm/subcircuit-library@3.0.0`. The browser-compatible package is
still `@tokamak-zk-evm/snark-browser-compat@2.1.5` in npm; the local 3.0.0
browser candidate and operator-controlled CRS are not established as final
production-admission artifacts by this report. Mocked downloads and local
native verification do not establish production installation or Docker
execution against those pending artifacts. MPC, publication, and the remaining
CLI release work are outside this fixed-input installation change. The npm
registry status above was checked on 2026-09-23.
