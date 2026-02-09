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
- [x] Inspect `writeEvmAnalysisJson` usage in `examples/erc20Transfers/main.ts`
- [x] Add `circuitGenerator.circuitPlacements` output to analysis JSON payload
- [ ] Verify JSON output path/content and record results

# Review
- [ ] `npm run test:node` failed with tsx IPC `EPERM` on `/var/folders/.../tsx-501/*.pipe`, so output verification could not complete in sandbox.

# Todo
- [x] Address BigInt serialization error in `writeEvmAnalysisJson`
- [x] Verify analysis JSON output after fix

# Review
- [x] `npm run test:node` ran successfully and produced `outputs/analysis/circuit_placements.json` without BigInt serialization errors.

# Todo
- [ ] Inspect `outputs/analysis/circuit_placements.json` and `outputs/permutation.json` to extract schema/fields
- [ ] Cross-check related generator code/docs to infer how placements + permutations define circuits
- [ ] Summarize inferred circuit definition with assumptions and open questions

# Review
- [x] Updated visualizer to use Mermaid when available with fallback PNG renderer and verified output; `mmdc` missing so builtin renderer wrote `outputs/analysis/circuit_diagram.png`.

# Todo
- [x] Read `src/circuitGenerator/circuitGenerator.ts` to trace how circuit placements flow into placement variables
- [x] Inspect `VariableGenerator` (and any direct callers) to map the extraction from placements to placement variables
- [x] Summarize the extraction path from `outputs/circuit_placements.json` to `outputs/placementVariables.json` with explicit assumptions

# Review
- [x] Documented how `placementsCompatibleWithSubcircuits` (written as `outputs/analysis/circuit_placements.json`) feeds `_generatePlacementVariables` and produces `outputs/placementVariables.json`, including padding, witness generation, and output checks.

# Todo
- [x] Inspect `outputs/analysis/circuit_placements.json` and `outputs/permutation.json` to capture schema and linking identifiers
- [x] Trace generation code (permutation generator) to map how placements feed permutation
- [x] Summarize the relationship with examples, assumptions, and open questions

# Review
- [x] Documented how permutation rows/cols map to placement indices and global wire IDs derived from circuit placements and subcircuit flatten maps.

# Todo
- [x] Inspect `outputs/analysis/circuit_placements.json` to determine the fields needed for diagram nodes/edges
- [x] Implement `scripts/circuit_visualizer.ts` to parse placements and emit ASCII/mermaid diagram
- [x] Add a simple usage note (arg parsing) and run a quick sanity check (node/tsx) if possible

# Review
- [x] Added `scripts/circuit_visualizer.ts` and verified with tsx; wrote `/tmp/circuit_diagram.mmd`.

# Todo
- [x] Update `scripts/circuit_visualizer.ts` to render a PNG diagram instead of markdown output
- [x] Verify PNG output is written under `outputs/analysis`

# Review
- [x] `tsx scripts/circuit_visualizer.ts --format diagram` wrote `outputs/analysis/circuit_diagram.png`.

# Todo
- [x] Check for Mermaid CLI availability (e.g., mmdc) or viable PNG renderer in repo
- [x] Update `scripts/circuit_visualizer.ts` to add ELK layout and render PNG via resvg with fallbacks
- [ ] Verify PNG output under `outputs/analysis` with ELK + resvg

# Review
- [ ] `mmdc` was not found in node_modules/bin before adding dependencies; ELK/resvg output not yet verified (needs install).

# Todo
- [x] Define wire-level diagram layout (top inputs, bottom outputs) and mapping from placements/inPts/outPts
- [x] Update `scripts/circuit_visualizer.ts` to render per-wire arrows and connect matching wires across placements
- [ ] Verify PNG/3D outputs and note any layout limits

# Review
- [ ] ELK port-based renderer added; PNG/3D verification pending install of new deps (`elkjs`, `@resvg/resvg-js`).
