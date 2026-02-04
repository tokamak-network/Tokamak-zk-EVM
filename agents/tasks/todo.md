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
- Pending.
