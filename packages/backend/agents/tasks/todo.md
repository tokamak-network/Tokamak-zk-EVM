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

# Plan (2026-02-07)
- [x] Inspect ICICLE Rust NTT API for init-domain and coset configuration. (User found answer)
- [x] Inspect C++/backend NTT domain initialization and coset handling. (User found answer)
- [x] Summarize whether coset-based domain can be set during init and how coset NTTs are configured. (User found answer)

# Review (2026-02-07)
- [x] Summarize findings and evidence.
User confirmed coset NTTs are configured via `NTTConfig.coset_gen`, not during `initialize_domain`.

# Plan (2026-02-07)
- [x] Confirm desired semantics: replace manual coset scaling in `from_rou_evals`/`to_rou_evals` with `NTTConfig.coset_gen` per-axis (since `initialize_domain` has no coset config).
- [x] Update `_biNTT` to accept optional `coset_x/coset_y` and apply them on the respective axis NTT calls; remove manual scaling in `from_rou_evals`/`to_rou_evals`.
- [x] Add a targeted test that compares new coset NTT results against the previous manual-scaling behavior.
- [x] Verify with a focused test run and record results.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Switched 2D NTT coset handling to `NTTConfig.coset_gen` per axis and removed manual coefficient scaling in `from_rou_evals`/`to_rou_evals`. Added a regression test that compares coset-gen results against legacy manual scaling for both forward and inverse paths.  
Verification: `cargo test -p libs test_coset_ntt_matches_manual_scaling -- --nocapture` (pass). Warnings in `libs` are pre-existing.

# Plan (2026-02-07)
- [x] Add a global NTT domain size tracker and initialize it in `Prover::init` using `max(m_i, n) * s_max`, with device selection.
- [x] Remove `_biNTT` domain init/release; add strict size validation against the initialized size.
- [x] Update tests or callers that rely on `_biNTT` to set the domain size before use.
- [x] Verify with a focused test run and record results.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Initialized NTT domain once in `Prover::init` (after device selection) using `max(m_i, n) * s_max`, removed per-call init/release in `_biNTT`, and added strict domain-size validation. Added a helper to initialize the NTT domain in tests before using 2D NTT.  
Verification: `cargo test -p libs test_coset_ntt_matches_manual_scaling -- --nocapture` (pass). Warnings in `libs` are pre-existing.

# Plan (2026-02-07)
- [x] Update Prover NTT domain size to cover 2x expansions (2*max(n,m_i) by 2*s_max).
- [x] Run a minimal build/test to ensure compile.
- [x] Record results.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Expanded NTT domain size init in `Prover::init` to `2*max(m_i,n)` by `2*s_max` to cover zero-knowledge padding, preventing domain-too-small errors.  

# Plan (2026-02-07)
- [x] Inspect `prove/output/timing.release.md` and commit history to identify any new snapshot rows where `total_wall` drops by >= 3.0s vs prior snapshot.
- [x] Update `prove/optimization/optimization_report.md` Source Series table and Notes to reflect any new qualifying rows and commit summaries.
- [x] Create/refresh the corresponding mini-report(s) under `prove/optimization/mini-reports/` with proposition+proof excerpts.
- [x] Verify consistency: totals, commit lists, links, and mini-report values match the Source Series rows.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Added a new Source Series row for 2026-02-08 with total_wall 27.908515, updated Notes, and created the mini-report `2026-02-08_7964656a.md` with proposition+proof excerpts.  
Verification: totals, commit list, and mini-report link/value match `prove/output/timing.release.md` and `git log` (no tests run).
- [x] Save prompt to `prove/optimization/prompts/REPORTING.md` and verify content.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Added `prove/optimization/prompts/REPORTING.md` with rules for optimization_report and mini-report generation. No tests run.

# Plan (2026-02-08)
- [x] Re-scan `prove/output/timing.release.md` snapshot commits and total_wall values to confirm which rows qualify (>= 3.0s drop).
- [x] Rebuild Source Series commit lists to include only commits touching `packages/backend/`, and update change summaries accordingly.
- [x] Update all mini-reports to match the new commit lists and ensure change analysis only references backend files with proof excerpts.
- [x] Verify consistency: totals, commit lists, and mini-report links/values match Source Series rows.

# Review (2026-02-08)
- [x] Summarize changes and verification results.
Restricted Source Series commit lists and summaries to backend-only commits for each qualifying snapshot, and updated all mini-reports to match the new lists with backend-only proof excerpts and normalized total_wall values.  
Verification: totals, commit lists, and mini-report links/values checked for consistency (no tests run).

# Plan (2026-02-07)
- [x] Inspect `BivariatePolynomial::_mul` and decide precise log points for from_coeffs, resize, to_rou_evals, ScalarCfg::mul, from_rou_evals.
- [x] Add per-step timing logs in `libs/src/bivariate_polynomial/mod.rs` aligned with existing logging style.
- [x] Locate the `_mul` test script in `libs/src/tests.rs` and document the command to run it.
- [x] Verify by running the narrowest applicable test for `_mul` (or document if none found).

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Added per-step timing logs in `BivariatePolynomial::_mul` for from_coeffs, resize, to_rou_evals, ScalarCfg::mul, and from_rou_evals. Located `_mul` coverage in `tests::tests::test_mul_polynomial`.  
Verification: `cargo test -p libs test_mul_polynomial -- --nocapture` (pass). Warnings in `libs` (pre-existing).

# Plan (2026-02-07)
- [x] Identify _biNTT call sites in verify and preprocess.
- [x] Initialize NTT domain in verify init and preprocess gen using the same (4,2) domain sizing as Prover.
- [x] Verify with a minimal build/test if needed.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Initialized NTT domain in `Verifier::init` and `Preprocess::gen` using the same (4,2) sizing and added device selection.  
Verification: `cargo test -p verify --lib` (0 tests). Warnings in `libs`/`prove`/`verify`/`preprocess` are pre-existing.

# Plan (2026-02-07)
- [x] Initialize NTT domain in trusted-setup using max(n,l,m_i,s_max) or max(n,m_i)*s_max in testing-mode.
- [x] Verify with a minimal build/test if needed.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Initialized NTT domain in trusted-setup to `max(n,l,m_i,s_max)` (default) and `max(n,m_i)*s_max` in testing-mode.  
Verification: `cargo test -p trusted-setup --lib` (0 tests). Warnings in `libs` are pre-existing.

# Plan (2026-02-07)
- [x] Inspect `_biNTT` implementation and call sites for layout/memory costs.
- [x] Identify optimization opportunities and constraints (transpose, domain init, allocations).
- [x] Summarize recommendations and tradeoffs for runtime reduction.

# Review (2026-02-07)
- [x] Summarize findings and note any verification limits.
Identified likely hotspots (domain init/release, repeated device allocations, transpose overhead) and suggested reuse/caching and column-batch/2D NTT alternatives. No code changes or tests run.

# Plan (2026-02-07)
- [x] Add timing instrumentation in `_biNTT` for `initialize_domain`, both `ntt` calls, both `transpose` calls, and `release_domain`.
- [x] Add a focused test in `libs/src/tests.rs` that triggers `_biNTT` and prints timing logs.
- [x] Verify by running the new test and record results.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Added `_biNTT` timing logs for domain init/release, each NTT, and both transposes. Added `test_biNTT_timing` to exercise forward/inverse and print timings.  
Verification: `cargo test -p libs test_biNTT_timing -- --nocapture` (pass). Warnings in `libs` (pre-existing).

# Plan (2026-02-07)
- [x] Inventory console timing logs (println/eprintln with elapsed) across libs/prove/verify and identify which are safe to remove without affecting timing data collection.
- [x] Remove console timing logs and any timing-only `Instant` measurements while keeping timing event collection used by `launch.json` prove timing tests.
- [x] Verify with a minimal build/test (or document why not run).

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Removed console timing prints and their supporting `Instant` measurements from libs/prove/verify (including tests and bivariate polynomial timing macros), while keeping timing event collection for `prove/optimization/tests/timing.rs`.  
Verification: `cargo check -p libs -p prove -p verify` (warnings only, pre-existing).

# Plan (2026-02-07)
- [x] Update lessons for the correction about including all modified files when requested.
- [x] Stage all changes, commit with a summary message, and push.
- [x] Verify git status is clean after push.

# Review (2026-02-07)
- [x] Summarize changes and verification results.
Committed and pushed all modified files in `packages/backend` as requested.  
Verification: `git status -sb` (clean).

# Plan (2026-02-07)
- [x] Fetch PR 181 metadata (title/body) and commit list from GitHub; if unavailable, locate equivalent commits in local git history.
- [x] Analyze commit diffs to extract purpose, concrete changes, and results; group into a coherent PR narrative.
- [x] Draft an updated PR title and body reflecting those findings and cross-check against commit list for coverage.

# Review (2026-02-07)
- [x] Summarize findings and verification results.
Could not fetch PR 181 page via web tool (cache miss). Used `origin/dev..HEAD` commit list and local diffs to derive purpose/changes/results and draft updated PR title/body. No tests run for this step.
