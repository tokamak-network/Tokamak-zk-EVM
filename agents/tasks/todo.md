# PR177 Gemini Code Assist Review Follow-up (2026-02-03)

## Plan
- [x] Reconfirm no change needed in `tests/scripts/run-erc20-main-from-configs.ts` (errors must fail fast).
- [x] Re-run `npm run -s test:node` with no timeout under escalated permissions.
- [x] Record verification results in this file.

## Review
- Escalated `npm run -s test:node` ran ~8m45s and failed with `Synthesizer: step error: Error: Unreachable stackPt index` during the run (runCommand in `tests/scripts/run-erc20-main-from-configs.ts` fails fast as expected).

# run-erc20-main-from-configs error logging

## Plan
- [x] Add config file path logging when a run fails in `packages/frontend/synthesizer/tests/scripts/run-erc20-main-from-configs.ts`.
- [x] Re-run `npm run -s test:node` with 1-hour timeout under escalated permissions.
- [x] Record verification results in this file.

## Review
- Escalated `npm run -s test:node` completed in ~5m54s with exit code 0. Output still included repeated `Synthesizer: step error: Error: Unreachable stackPt index` logs during execution.

# Separate prep vs test scripts

## Plan
- [x] Update `packages/frontend/synthesizer/package.json` to split config generation and test execution into separate scripts.
- [x] Make `test` point only to the execution script; add a prep script for config generation.
- [x] Run the new scripts or record why verification couldn’t be done.

## Review
- `npm run -s test:prep` completed successfully (exit code 0).
- `npm run -s test` completed successfully (exit code 0) and finished permutation/instance_description validations.
- [x] Restore `test:node` in `packages/frontend/synthesizer/package.json` to align the pre-commit hook.
- [x] Update `tests/scripts/run-erc20-config-matrix.ts` to ignore `runCommand` errors but fail fast for internal script errors.
- [x] Refactor `parseCliInputs` into smaller helpers without changing behavior.
- [x] Run a targeted verification and record results.

## Review
- `npm run -s test:node` failed under sandbox with `listen EPERM` when `tsx` attempted IPC.
- Escalated `npm run -s test:node` ran but timed out after 120s; output showed multiple `Unreachable stackPt index` errors during synthesizer execution.

# PR177 Gemini Code Assist Review

## Plan
- [x] Locate PR 177 in tokamak-network/Tokamak-zk-EVM and collect all review comments authored by gemini-code-assist.
- [ ] Enumerate and analyze each comment (what it asks, risk/impact, proposed change).
- [ ] Ask for approval per comment (or grouped by file) before making code changes.
- [ ] Implement approved changes with minimal diff and note any declines.
- [ ] Verify changes (tests or targeted checks) and capture results.

## Review
- Updated `--preprocess` usage to accept an optional file path and copy it into `dist/resource/synthesizer/output` before preprocess runs.
- Verified by inspection in `scripts/interface.sh` and `scripts/tokamak-cli-core`.

# build-release job validation (2026-02-04)

## Plan
- [ ] Confirm execution environment (local macOS vs Linux runner) and any required secrets.
- [ ] Enumerate jobs/steps from `.github/workflows/build-release.yml` and map to local commands.
- [ ] Execute each job step-by-step with best-effort substitutions; capture pass/fail reasons.
- [ ] Classify jobs as working, failing, or not runnable (with concrete error/constraint).
- [ ] Record results and verification evidence in this file.

# Integrate synthesizer-tests into build-release (2026-02-04)

## Plan
- [x] Review `.github/workflows/synthesizer-tests.yml` and `.github/workflows/build-release.yml` for overlaps and triggers.
- [x] Decide placement for synthesizer tests within `build-release.yml` (second job position) and preserve original trigger scope.
- [x] Remove the standalone `synthesizer-tests.yml` workflow as requested.
- [x] Apply edits and re-check YAML validity (visual inspection) and record results here.

## Review
- Added `synthesizer-tests` job as the second job in `.github/workflows/build-release.yml`, preserving original PR-only scope (main/dev).
- Removed `.github/workflows/synthesizer-tests.yml`.

# Gate synthesizer-tests on build-and-setup artifacts (2026-02-04)

## Plan
- [x] Update `synthesizer-tests` to `needs: build-and-setup`.
- [x] Download `qap-compiler` and `synthesizer` artifacts from `build-and-setup`.
- [x] Remove redundant dependency install steps and rely on artifact-provided `node_modules`.
- [x] Verify YAML integrity by inspection and record results here.

## Review
- `synthesizer-tests` now depends on `build-and-setup` and downloads `qap-compiler`/`synthesizer` artifacts.
- Removed `npm install`/`tsx` install steps; test runs via `cd packages/frontend/synthesizer && npm test`.

# Replace L2 TON Transfer test with proof generation test (2026-02-04)

## Plan
- [x] Rename the EVM compatibility test job id/artifact to align with `evm-compat-test`.
- [x] Replace `l2-ton-transfer-test` with `proof-generation-test` using the requested CLI steps and artifacts.
- [x] Update downstream `needs` and release notes references.
- [x] Verify YAML integrity by inspection and record results here.

## Review
- Renamed the EVM compatibility tests job id to `evm-compat-test` and its outputs artifact accordingly.
- Replaced `l2-ton-transfer-test` with `proof-generation-test` that consumes `built-dist` and `evm-compat-test` outputs, then runs preprocess/prove/extract-proof/verify.
- Updated downstream job dependencies and release notes to reference the new proof generation test.

# Local test of first three build-release jobs (2026-02-04)

## Plan
- [x] Identify the first three jobs in `.github/workflows/build-release.yml` and map their run steps to local commands.
- [x] Execute the mapped commands locally (or record OS/tooling blockers) for each job in order.
- [x] Capture outcomes, errors, and constraints in this file.

## Review
- Environment: macOS 26.2 (arm64). Node `v25.3.0`, npm `11.7.0`, Rust `1.88.0`, Bun `1.3.5`, dos2unix present.
- build-and-setup:
  - `sudo apt-get update` blocked (`operation not permitted: sudo`), so Ubuntu system deps step not runnable locally.
  - `npm install --legacy-peer-deps` for `qap-compiler` and `synthesizer` reported `up to date`.
  - `npm install -g tsx` failed due to no network (`ENOTFOUND registry.npmjs.org`).
  - `./tokamak-cli --install` failed: `Failed to update constants.circom (pattern not found)` and `tsx` IPC `listen EPERM` under sandbox.
- evm-compat-test:
  - `npm test` failed immediately with `tsx` IPC `listen EPERM` (same sandbox restriction).
- proof-generation-test:
  - `./tokamak-cli --preprocess packages/frontend/synthesizer/outputs/preprocess.json` failed: input file not found.
  - `./tokamak-cli --prove ./packages/frontend/synthesizer/outputs` failed: missing `instance_description.json`.
  - `./tokamak-cli --extract-proof ./test-out/test-proof.zip` failed because preprocess failed (missing files).
- `./tokamak-cli --verify ./test-out/test-proof.zip` failed: file not found.

# Adjust test gating and missing-input logging (2026-02-04)

## Plan
- [x] Update test job conditions so they run on push to main.
- [x] Add explicit input checks in `proof-generation-test` to log missing upstream artifacts/files before running CLI steps.
- [x] Verify YAML integrity by inspection and record results here.

## Review
- `evm-compat-test` and `proof-generation-test` now run on PR(main/dev) and push(main).
- Added explicit missing-input checks for preprocess/prove and proof bundle before extract/verify, with clear error logs.

# tokamak-cli preprocess optional input (2026-02-04)

## Plan
- [x] Inspect CLI argument parsing and preprocess flow to decide where to accept the optional file path.
- [x] Update `--preprocess` usage/validation plus `step_preprocess` to copy the provided file into `dist/resource/synthesizer/output` before running preprocess.
- [x] Verify changes by inspection (and run a targeted command if appropriate), then record results here.

## Review
- Staged all changes and committed as `ci: integrate synthesizer tests and add preprocess input support`.
- Pushed branch `jake-ci-update` to `origin` and set upstream tracking (`origin/jake-ci-update`).

# Commit and push all changes (2026-02-04)

## Plan
- [ ] Review `git status` and capture the scope of changes to be committed.
- [ ] Stage all changes.
- [ ] Commit with the user-provided message.
- [ ] Push the current branch to the default remote.

## Review
- Created PR from `jake-ci-update` to `dev`: https://github.com/tokamak-network/Tokamak-zk-EVM/pull/178

# Create PR to dev (2026-02-04)

## Plan
- [ ] Gather PR details (base branch `dev`, compare `jake-ci-update`) and draft PR body using `.github/PULL_REQUEST_TEMPLATE.md`.
- [ ] Confirm draft PR body with the user.
- [ ] Create the PR (likely via `gh pr create`) and record the result here.

## Review
- Fixed typo in `scripts/interface.sh` (`preprocss` → `preprocess`).
- Corrected preprocess input validation in `scripts/tokamak-cli-core` to distinguish missing paths vs. directories.
- Removed accidental `packages/frontend/qap-compiler/scripts/temp.txt` from the repo.

# PR 178 gemini-bot review (2026-02-04)

## Plan
- [ ] Fetch gemini-bot comments from PR 178 and summarize requested changes.
- [ ] Analyze each comment and propose fixes; confirm scope if needed.
- [ ] Implement approved fixes with minimal diffs.
- [ ] Verify and record results in this file.
- [ ] Update PR with new commits.

## Review
- Added `npm install -g tsx` in `evm-compat-test` to satisfy synthesizer test runner dependency.
- Added a guarded `zip`/`unzip` install in `proof-generation-test` to support `--extract-proof` and ZIP-based `--verify`.
- No extra dependency installs needed for `tokamak-ch-compat-test` beyond existing steps.

# div_by_vanishing performance review (2026-02-04)

## Plan
- [x] Inspect `div_by_vanishing` implementation and helper calls for hot spots (allocation, FFT/eval, resizing).
- [x] Map dataflow and identify redundant transforms, copies, and device/host transfers.
- [x] Propose concrete optimization opportunities (algorithmic + micro-optimizations) with risk/complexity notes.
- [x] Record findings in this file.

## Review
- Key hot spots: `_slice_coeffs_into_blocks` host copy + block materialization, repeated `device_malloc`/host-device copies, and multiple full 2D NTTs for denom polynomials and quotients.
- Algorithmic wins: use 1D NTT per row/column (denom depends on single variable), broadcast denom evals instead of building full matrices, and compute `b_tilde` directly in eval space to avoid `mul_monomial` + `self - r` clones.
- Structural wins: avoid building `t_c`/`t_d` polynomials + `resize`; compute vanishing evals directly (or cache) and reuse scratch buffers.
- Noted risk: correctness must be rechecked if replacing 2D NTTs or changing evaluation domains; no code changes made.

# div_by_vanishing test script + timing logs (2026-02-04)

## Plan
- [x] Add timing logs inside `div_by_vanishing` for `to_rou_evals`, `div`, `accumulate`, `from_coeffs`.
- [x] Add a dedicated `div_by_vanishing` test in `libs/src/tests.rs` that asserts correctness and prints timing logs.
- [x] Remove or deprecate the shell test script if it’s no longer needed.
- [x] Verify by inspection (no runtime) and record results here.

## Review
- Added env-gated timing logs in `div_by_vanishing` around `accumulate`, `from_coeffs`, `to_rou_evals`, and `div`.
- Added `test_div_by_vanishing_basic_with_timing` in `libs/src/tests.rs` and refactored the shared logic into a helper.
- Removed the `tests/div_by_vanishing` shell script and directory after moving the test into Rust.
- Verification by inspection only; no runtime executed.

# Add missing dependencies in build-release test jobs (2026-02-04)

## Plan
- [ ] Inspect `.github/workflows/build-release.yml` test jobs (`evm-compat-test`, `proof-generation-test`, `tokamak-ch-compat-test`) and enumerate commands and required tools/binaries.
- [ ] Identify missing dependencies (e.g., `tsx`, `node_modules`, CLI tools) per job and decide the minimal installation steps.
- [ ] Update the workflow to install required dependencies in the affected jobs with minimal changes.
- [ ] Review YAML for correctness and record results here.

## Review
- Updated `tokamak-ch-compat-test` to pass absolute `${{ github.workspace }}` paths for L2StateChannel input JSON files, avoiding path resolution issues when the synthesizer binary runs from its own directory.

# Fix tokamak-ch-compat-test missing L2StateChannel inputs (2026-02-04)

## Plan
- [ ] Inspect `tokamak-ch-compat-test` command and `scripts/channel-functions.sh` to confirm path resolution for `--previous-state`, `--block-info`, and `--contract-code`.
- [ ] Decide minimal fix (e.g., use absolute paths in workflow or adjust script to resolve paths from repo root).
- [ ] Update `.github/workflows/build-release.yml` accordingly.
- [ ] Record the fix in this file and note verification status.

## Review
- Pending.
