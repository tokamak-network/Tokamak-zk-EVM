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

# Plan (2026-02-07)
- [x] Inspect `div_by_vanishing` implementation and supporting utilities to extract exact math definitions and assumptions.
- [x] Draft math spec (inputs, intermediate computations, outputs) in `prove/optimization/div_by_vanishing.md`.
- [x] Verify the doc matches code behavior and record any assumptions/constraints.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Added a math/spec write-up for `div_by_vanishing` with inputs, intermediate steps, outputs, cache behavior, and constraints. No code execution or tests were run.

# Plan (2026-02-07)
- [x] Rework `div_by_vanishing.md` to include explicit variable dimensions and rigorous TeX formulas.
- [x] Align the document with code-level behaviors (NTT domains, coset scaling, resize semantics).
- [x] Verify the final doc for consistency and note any required assumptions.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Upgraded the document with explicit dimensions, formal 2D NTT/coset evaluation definitions, and TeX-based equations for each step. Added accuracy assumptions for degree bounds and resize truncation behavior. No code execution or tests were run.

# Plan (2026-02-07)
- [x] Design `div_by_vanishing_opt` (axis-only denom inverse + tiling) and decide cache reuse.
- [x] Implement `div_by_vanishing_opt` in `libs/src/bivariate_polynomial/mod.rs` and extend trait signature.
- [x] Add benchmark-style test in `libs/src/tests.rs` to compare timings and correctness vs baseline.
- [x] Verify by running the new test (or document why it couldn't be run).

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Added `div_by_vanishing_opt` with axis-only denom inverse tiling and tests including a basic correctness check and an ignored benchmark.  
Verification: `cargo test -p libs test_div_by_vanishing_opt_basic -- --nocapture` (pass). Warnings in `libs` (pre-existing).

# Plan (2026-02-07)
- [x] Translate `prove/optimization/div_by_vanishing.md` to English.
- [x] Commit all current changes with a clear message.
- [x] Push the commit.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Translated the div_by_vanishing spec to English and committed/pushed all changes. No new tests run for this step.

# Plan (2026-02-07)
- [x] Extend `prove/optimization/div_by_vanishing.md` with separate math specs for `div_by_vanishing` and `div_by_vanishing_opt`.
- [x] Add a concise differences summary (math + computational implications).
- [x] Verify document consistency and note any assumptions.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Documented baseline vs optimized math, and added a differences summary with computational implications. No tests run.

# Plan (2026-02-07)
- [ ] Locate all div_by_vanishing call sites under prove/ and identify any timing labels or dependent assumptions.
- [ ] Update Prove call sites to div_by_vanishing_opt and adjust any related labels/messages.
- [ ] Review for consistency and report; run targeted tests if feasible.

# Review (2026-02-07)
- [ ] Summarize changes and verification results.

# Plan (2026-02-07)
- [x] Extend div_by_vanishing_opt cache to store axis inverses and include base in cache keys.
- [x] Update cache initialization sites and ensure baseline cache lookup matches new keys.
- [x] Run a targeted div_by_vanishing_opt test to verify behavior.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Added axis-inverse caching for `div_by_vanishing_opt`, extended cache keys with `base`, and updated cache initializations.  
Verification: `cargo test -p libs test_div_by_vanishing_opt_basic -- --nocapture` (pass). Warnings in `libs` (pre-existing).

# Plan (2026-02-07)
- [x] Restructure `prove/optimization/optimization_report.md` around total_wall reduction events from `timing.release.md`.
- [x] Group commits by reduction event and summarize combined changes when multiple commits contribute.
- [x] Verify the report for consistency (no tests needed).

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Rebuilt the optimization report around total_wall reduction events and grouped commits by reduction streaks. No tests run.

# Plan (2026-02-07)
- [x] Reshape Source Series table to list commit ranges since prior row and replace message with change summary.
- [x] Expand Reduction Events with row-level detailed change notes.
- [x] Verify consistency of totals and deltas.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Updated Source Series with commit ranges and change summaries; expanded Reduction Events with row-level detail and deltas. No tests run.

# Plan (2026-02-07)
- [x] Update Source Series row inclusion to only reductions ≥3s vs prior snapshot.
- [x] Refresh Reduction Events to match new row criteria and deltas.
- [x] Verify consistency of totals and thresholds.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Adjusted Source Series to include only ≥3s reductions and aligned Reduction Events accordingly. No tests run.

# Plan (2026-02-07)
- [x] Remove Reduction Events section from optimization_report and add mini-report links per Source Series row.
- [x] Create mini-report files under prove/optimization/mini-reports for each Source Series row.
- [x] Verify links and summaries for consistency.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Removed Reduction Events, added mini-report links, and generated per-row mini-report files. No tests run.

# Plan (2026-02-07)
- [x] Expand Change Analysis in each mini-report with specific what/how changes.
- [x] Verify mini-report accuracy and consistency.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Expanded Change Analysis in all mini-reports with concrete change details. No tests run.

# Plan (2026-02-07)
- [x] Reformat mini-report Change Analysis as proposition lists with proof excerpts or formulas.
- [x] Add minimal code/pseudocode excerpts per proposition to support claims.
- [x] Verify all mini-reports align with current code and keep excerpts short.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Rewrote mini-reports with proposition lists and short proof excerpts per claim. No tests run.

# Plan (2026-02-07)
- [x] Draft a single prompt defining rules for optimization_report and mini-reports.
- [x] Include output paths, row inclusion threshold, column rules, and mini-report evidence format.
- [x] Save prompt to `prove/optimization/prompts/REPORTING.md` and verify content.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Added `prove/optimization/prompts/REPORTING.md` with rules for optimization_report and mini-report generation. No tests run.
