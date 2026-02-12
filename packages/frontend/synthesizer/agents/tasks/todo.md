# Todo
- [x] Review `traceKeyOrigin` behavior against current `outputs/analysis/step_log.json` and pinpoint missing opcode handling
- [x] Strengthen SLOAD origin tracing for value-preserving stack ops while keeping minimal impact
- [x] Verify the updated tracing against `outputs/analysis/step_log.json` and record results

# Review
- [x] Verified `traceKeyOrigin` resolves both reported keys to `push32` using the current `outputs/analysis/step_log.json`.

# Todo
- [x] Add GitHub Actions workflow to run synthesizer `npm test` on PRs targeting `dev` or `main`
- [x] Configure workflow to install dependencies for synthesizer (and any required packages) and set required secrets
- [x] Record verification/notes for the new workflow

# Review
- [x] Added `.github/workflows/synthesizer-tests.yml` to run synthesizer `npm test` on PRs targeting `dev`/`main` with `ALCHEMY_API_KEY` and `ETHERSCAN_API_KEY`.

# Todo
- [x] Locate PR#176 review comments (local artifacts or remote via GitHub/gh)
- [x] Summarize each bot comment in order and map to affected files/lines if available
- [x] Ask for your decision on each suggestion (accept/skip/needs change)

# Todo
- [x] Restrict `writeEvmAnalysisJson` output path to `outputs/analysis` and sanitize filename (jsonWriter)
- [x] Switch `writeEvmAnalysisJson` to async fs (fs.promises) (jsonWriter)
- [x] Add `scripts/temp.json` to `.gitignore`
- [x] Enforce non-empty `network` parsing in ERC20 config loader
- [x] Validate `txHash` via `parseHexString` and update `Erc20TransferConfig` type
- [x] Tighten `message_code_addresses.json` error handling (ENOENT only)
- [x] Verify with `npm run tsc`

# Review
- [ ] Confirmed comment source and delivered per-comment explanations plus decisions
- [ ] `npm run tsc` failed (permission denied; `tsc` not found when run via bash)

# Todo
- [x] Decide which test command should run on every commit (default: `npm run test:node` for speed)
- [x] Add package-scoped git hook automation (hook script + installer/config) to run the chosen tests
- [x] Verify hook setup locally (dry run) and record results

# Review
- [x] `./.githooks/pre-commit` failed because vitest reported "No test files found" (exit 1) — intentional per requirement

# Todo
- [x] Define CLI flags/non-interactive mode for `scripts/generate-erc20-config.ts` to run without prompts
- [x] Add automated ERC20 config matrix runner and store per-case `config.json` outputs with distinct filenames
- [x] Wire the new runner into `npm run test:node` and verify the script at least starts (record results)

# Review
- [ ] `npm run test:erc20-config` initially failed under sandbox (tsx IPC EPERM); rerun with escalated permissions timed out after 120s and surfaced Synthesizer "Unreachable stackPt index" errors mid-matrix

# Todo
- [x] Add test runner script in `tests/scripts/` to execute `examples/erc20Transfers/main.ts` for each config in `tests/configs`
- [x] Move each run's `outputs/` contents into `tests/outputs/<config-name>/`
- [x] Verify script structure (dry run or sanity check) and record results

# Review
- [x] Added `tests/scripts/run-erc20-main-from-configs.ts` and verified it exists (structure check only; full execution not run).
- [x] Ran `tsx tests/scripts/run-erc20-main-from-configs.ts`; exited 0 and archived outputs under `tests/outputs/<config-name>/`.

# Todo
- [x] Update `run-erc20-main-from-configs` to compare `permutation.json` within groups sharing network/contractAddress/transferSelector
- [x] Verify script structure after update and record results

# Review
- [x] Added permutation comparison and verified script file presence (no full run yet).

# Todo
- [x] Add instance_description.json error scan ("Error:") to run-erc20-main-from-configs

# Review
- [x] Updated script to fail when instance_description.json contains "Error:" (structure check only).
- [x] Ran `tsx tests/scripts/run-erc20-main-from-configs.ts`; exited 0 and completed permutation + instance_description validations.

# Todo
- [x] Inspect current env/RPC usage in `examples/erc20Transfers/main.ts` and `src/interface/cli/index.ts`
- [x] Update env handling to read `ALCHEMY_API_KEY` and derive `RPC_URL` based on network (mainnet/sepolia)
- [x] Verify TypeScript builds or run the most relevant check, then document results

# Review
- [x] Confirmed RPC URL selection uses `ALCHEMY_API_KEY` and respects mainnet vs sepolia network settings
- [ ] `npm run tsc` failed: `sh: ../../../config/monorepo-js//cli/ts-compile.sh: Permission denied`

# Todo
- [x] Inspect shared RPC/network helpers and define reusable utilities/types in `src/interface/rpc/types.ts` or `src/interface/rpc/utils.ts`
- [x] Refactor ERC20 example + CLI to consume the shared RPC/network utilities
- [x] Verify TypeScript build or targeted checks and record results

# Review
- [x] Confirmed duplicated RPC/network logic is consolidated into `src/interface/rpc` utilities
- [ ] `npm run tsc` failed: `sh: ../../../config/monorepo-js//cli/ts-compile.sh: Permission denied`

# Todo
- [x] Move Alchemy RPC constants/types from `src/interface/rpc/utils.ts` into `src/interface/rpc/types.ts`
- [x] Update RPC utilities and CLI imports to use the shared types/constants
- [x] Re-run the most relevant verification and record results

# Review
- [x] Confirmed Alchemy RPC constants/types are defined in `src/interface/rpc/types.ts` and consumed via imports
- [ ] `npm run tsc` failed: `sh: ../../../config/monorepo-js//cli/ts-compile.sh: Permission denied`

# Todo
- [x] Identify NodeJS-dependent env helpers in `src/interface/rpc/utils.ts` and relocate them to `src/interface/node/env.ts`
- [x] Update CLI and example imports to use the node env helpers
- [x] Re-run the most relevant verification and record results

# Review
- [x] Confirmed Node-specific env helpers live in `src/interface/node/env.ts` and callers use them
- [ ] `npm run tsc` failed: `sh: ../../../config/monorepo-js//cli/ts-compile.sh: Permission denied`

# Todo
- [x] Remove `setRpcUrlFromAlchemyEnv` usage and function if not needed, and simplify callers to compute RPC URL directly
- [x] Update any references/imports accordingly
- [x] Run the most relevant verification and record results

# Review
- [x] Confirmed Node env helpers only return RPC URLs and do not mutate `process.env`
- [ ] `npm run tsc` failed: `sh: ../../../config/monorepo-js//cli/ts-compile.sh: Permission denied`

# Todo
- [x] Confirm scope of commit (all current changes) and choose commit message
- [x] Commit changes on current branch
- [x] Push branch to origin
- [x] Open PR targeting `dev`

# Review
- [x] PR created: https://github.com/tokamak-network/Tokamak-zk-EVM/pull/177

# Todo
- [x] Inventory `src/synthesizer` modules and identify entrypoints/core classes
- [x] Trace synthesizer data flow and document responsibilities of major components
- [x] Review `examples/erc20Transfers/main.ts` to map example usage to synthesizer internals
- [x] Summarize synthesizer purpose and operation (with file references)

# Review
- [x] Completed code reading of synthesizer core, handlers, data structures, and ERC20 example; delivered analysis summary.

# Todo
- [ ] Inspect tokamak-l2js multi-tree APIs and map to existing Synthesizer usage
- [ ] Identify Synthesizer assumptions about single Merkle tree (buffers, storage cache, update/finalize flow)
- [ ] Draft multi-tree data model changes (per-address caches, root in/out buffers)
- [ ] Outline code changes + verification plan, then confirm with user before implementation

# Review
- [ ] Pending

# Todo
- [ ] Confirm remaining multi-tree semantics (proof ordering, trees touched vs all roots, unknown address handling)
- [ ] Finalize multi-tree refactor plan and share with user for approval

# Review
- [ ] Pending
