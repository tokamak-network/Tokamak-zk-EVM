# Plan
- [x] Make `read_R1CS_gen_uvwXY` adaptive: GPU path uses subcircuit-batched matmul; CPU path uses sparse rows without dense matmul.
- [x] Keep timing logs for both paths (CPU uses prep/sparse-eval; GPU uses wall-clock prep/matmul).
- [x] Verify: build/test `libs` and note runtime behavior.

# Review
- [x] Summarize changes and verification results.
Added sparse row storage in `SubcircuitR1CS` and CPU path now evaluates sparse rows directly (no dense matmul). GPU path remains subcircuit-batched matmul. Timing logs updated for sparse-eval.
Verification: `cargo test -p libs --lib` compiles but unit tests abort at runtime with SIGBUS after device registration (environment issue persists in tests).

# Plan (2026-02-06)
- [ ] Confirm quotient usage in `prove2`/`prove3` and ensure `div_by_vanishing` linearity assumption is safe for combining p1/p2/p3.
- [x] Update `prove2` to build a combined copy-constraint numerator and run `div_by_vanishing` once; store combined quotients and adjust testing-mode checks and any dependent uses.
- [x] Verify: run `cargo test -p prove --lib` (or the narrowest available test target) and capture results.

# Review (2026-02-06)
- [x] Summarize changes and verification results.
Combined copy-constraint numerator for `prove2` and compute `(qCX,qCY)` via a single `div_by_vanishing`. Updated `Q_CX/Q_CY` and `prove3` to consume combined quotients and adjusted testing-mode check.  
Verification: `cargo test -p prove --lib` (0 tests). Warnings reported in `libs` and `prove` (pre-existing).

# Plan (2026-02-06)
- [x] Inspect `prove/output/timing.release.md` and identify the exact timing breakdown for Prove4.
- [x] Trace the Prove4 timing instrumentation in code (`prove/optimization/tests/timing.rs`, `prove/src/lib.rs`, related modules) to see what is and is not measured.
- [x] Reconcile measured vs total time and report which operations are unmeasured (with file references).

# Review (2026-02-06)
- [x] Summarize findings and evidence for unmeasured operations.
Prove4 total is recorded by `prove4.total`, while poly/encode only include specific `time_block!` spans. Unmeasured time (~7.494503s) is dominated by untimed polynomial construction/eval and `div_by_ruffini` calls not wrapped in `time_block!` (e.g., Pi_AX/Pi_AY build, LHS_for_copy construction, Pi_B pre-encode). No code changes; no tests run.

# Plan (2026-02-06)
- [x] Inventory all operations in `prove/src/lib.rs` that likely exceed 0.1s and lack timing spans (focus on prove4).
- [x] Add `time_block!` spans around those operations with size metadata (prove4 only).
- [x] Verify build/tests for timing feature (or narrowest available) and update timing output if feasible.

# Review (2026-02-06)
- [x] Summarize changes and verification results.
Replaced coarse prove4 build timing with per-operation spans: evals, scale_coeffs, from_rou_evals, mul/add/combine steps, and div_by_ruffini blocks inside LHS_for_copy and Pi_A paths. This aligns with existing op-style timing while surfacing heavy sub-ops.  
Verification: `cargo test -p prove --lib --features timing` (0 tests). Warnings in `libs` and `prove` (pre-existing).
