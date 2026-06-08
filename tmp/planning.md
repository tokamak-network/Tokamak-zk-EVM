# SEO, AEO, and GEO Exposure Improvement Plan

## Scope

This plan targets package and GitHub repository discoverability only. It does not assume or require a marketing website.

The goal is to improve:

- SEO for npm and GitHub search surfaces.
- AEO for answer engines that read package README files, GitHub repository metadata, and generated summaries.
- GEO for LLM-oriented retrieval over repository documentation.

## Status Summary

This document now separates the work into three states:

- Completed: discovery, planning, and source-text work already finished in this planning artifact.
- Started but incomplete: work that has draft material or partial analysis, but has not yet been implemented in the target repository documentation.
- Not started: work that has not yet been implemented or materially started beyond being listed as a planned task.

Unless a completed item explicitly says that a target README, package manifest, or root file was changed, completion refers to planning work in this file only.

## Completed

### Scope and Exposure Assessment

The exposure scope has been clarified:

- The repository is not being treated as a website project.
- The plan targets npm package pages, GitHub repository discovery, README answer extraction, and LLM-readable repository documentation.
- The root README is recognized as the canonical GitHub SEO, AEO, and GEO surface for this monorepo.

The current baseline has been assessed:

- The main public npm packages already define descriptions, keywords, repository metadata, package-specific homepage links, and issue links.
- The GitHub repository is public and has a useful description, README homepage, and relevant topics.
- Package READMEs already provide install, usage, package role, runtime model, and common-question material.
- `packages/frontend/synthesizer/llms.txt` exists and gives an LLM-readable map for the Synthesizer workspace.

### Root FAQ Source Text

Repository-level FAQ source text has been drafted in this plan. It is not yet implemented in the root `README.md`.

The drafted FAQ covers:

- What Tokamak zk-EVM is.
- What a Tokamak Layer 2 transaction is.
- The main package groups in the monorepo.
- Which npm package to install.
- What `tokamak-cli` does.
- What the subcircuit library does.
- What the Synthesizer does.
- The backend proving and verification protocol.
- The on-chain Solidity verifier implementation and deployment.
- The difference between `synthesizer-node` and `synthesizer-web`.
- Complex contract-call transaction support.
- The Ethereum Layer 2 execution assumption.
- Intentionally scoped-out features.
- Deprecated WASM verifier packages.
- The root changelog as the canonical release-note source.

The full draft is preserved in [Appendix A](#appendix-a-repository-faq-source-text).

### Synthesizer Q&A Source Text

The consumer-facing Synthesizer Q&A answer has been drafted in this plan. It is not yet implemented in `packages/frontend/synthesizer/README.md` or the package-specific Synthesizer README files.

The drafted answer states:

- The answer starts with `Partially, yes.`
- The Synthesizer is not limited to simple native transfers or a hardcoded ERC20 transfer template.
- Complex contract-call support depends on the execution staying within the supported opcode set, call flows, storage/memory/log handling, and runtime model.
- Current strongest documented support cases are ERC20 transfer flows and private-state mint, transfer, and redeem flows.
- Unsupported Ethereum behaviors are outside the consumer support claim because Tokamak zk-EVM is designed for Ethereum Layer 2 execution, not arbitrary Ethereum L1 execution.

The full draft is preserved in [Appendix B](#appendix-b-synthesizer-qa-source-text).

### External Reference Targets

The key external reference targets have been identified for future README implementation:

- `tokamak-l2js` npm package: https://www.npmjs.com/package/tokamak-l2js
- `tokamak-l2js` source repository: https://github.com/tokamak-network/TokamakL2JS
- Tokamak zk-SNARK paper: https://eprint.iacr.org/2024/507
- Solidity verifier repository: https://github.com/tokamak-network/Tokamak-zk-EVM-contracts
- Solidity Tokamak verifier source: https://github.com/tokamak-network/Tokamak-zk-EVM-contracts/blob/main/bridge/src/verifiers/TokamakVerifier.sol
- Ethereum mainnet `tokamakVerifier` deployment: https://etherscan.io/address/0x0C467a5082323Cc6F4b7077A9dFb0bbdaf6eC626

### Synthesizer Support Boundary Facts

The documentation claims have been grounded in implementation facts already collected for the plan:

- The public synthesis input contains `previousState`, `transaction`, `blockInfo`, and `contractCodes`.
- The runtime creates a Tokamak L2 transaction from the snapshot and runs it through the VM-backed synthesizer.
- The supported opcode list omits several behaviors, including contract creation and transient storage.
- The synthesizer explicitly rejects create messages and precompiled calls.
- Example and test coverage is currently centered on ERC20 transfer and private-state mint, transfer, and redeem flows.

## Started But Incomplete

### Root README Exposure Upgrade

Status: started through planning and FAQ source text, but not implemented in `README.md`.

Remaining work:

- Add a concise repository summary near the top of the root README.
- Add a first-screen package chooser.
- Add a public package table with npm links, package roles, and package README links.
- Add the repository-level FAQ from Appendix A.
- Add first-principles explanations of the CLI, Synthesizer, subcircuit library, and backend package groups.
- Add the Tokamak Layer 2 transaction explanation and `tokamak-l2js` links.
- Add the backend protocol note and the `An Efficient SNARK for Field-Programmable and RAM Circuits` link.
- Add the Solidity verifier note, contracts repository link, `TokamakVerifier.sol` link, and Etherscan deployment link.
- Add a user-facing note that the WASM verifier packages are deprecated.
- Link to package-specific README files for detailed usage.
- State that root `CHANGELOG.md` is the canonical release-note source.

### Synthesizer AEO Content

Status: started through the drafted answer in Appendix B, but not implemented in the Synthesizer README files.

Remaining work:

- Add the Q&A section to `packages/frontend/synthesizer/README.md`.
- Add or cross-link the Q&A in `packages/frontend/synthesizer/node-cli/README.md`.
- Add or cross-link the Q&A in `packages/frontend/synthesizer/web-app/README.md`.
- Keep the root README summary shorter than the package README answer.
- Ensure the answer does not overclaim arbitrary Ethereum transaction support.

### Package Metadata Normalization

Status: inspected locally and against the npm registry on 2026-06-08. The four supported public packages all have the required metadata fields, and the npm-published metadata exposes the same required package information for version `2.1.0`. Npm may normalize repository URLs, for example by adding a `git+` prefix.

Inspection result:

| Package | Required fields | Required manifest change | Keyword follow-up |
| --- | --- | --- | --- |
| `@tokamak-zk-evm/cli` | `description`, `keywords`, `homepage`, `repository.directory`, `bugs`, `license`, and `author` are present. | No required change. | No immediate keyword change. The current keywords are package-specific and include `tokamak-zk-evm`, `tokamak-network`, `prover`, `zk-EVM`, and `zk-SNARK`. |
| `@tokamak-zk-evm/subcircuit-library` | `description`, `keywords`, `homepage`, `repository.directory`, `bugs`, `license`, and `author` are present. | No required change. | No immediate keyword change. The `wasm` keyword is appropriate here because this package publishes WASM witness-generation artifacts, not a verifier package surface. |
| `@tokamak-zk-evm/synthesizer-node` | `description`, `keywords`, `homepage`, `repository.directory`, `bugs`, `license`, and `author` are present. | No required field-completeness change. | Consider adding `tokamak-zk-evm` for consistency with the CLI and subcircuit-library package. Do not add verifier/prover keywords because this package synthesizes circuit inputs rather than proving or verifying. |
| `@tokamak-zk-evm/synthesizer-web` | `description`, `keywords`, `homepage`, `repository.directory`, `bugs`, `license`, and `author` are present. | No required field-completeness change. | Consider adding `tokamak-zk-evm` and normalizing `zkevm` to the same `zk-EVM` spelling used by the other public packages. Keep `browser` and `wasm` because they describe this package's browser-facing bundled-artifact model. |

Concrete next plan:

1. Make no changes to descriptions, homepages, repository metadata, bugs URLs, license, or author fields unless a later release changes package ownership or package locations.
2. Apply only narrow keyword normalization to the Synthesizer packages:
   - Add `tokamak-zk-evm` to `packages/frontend/synthesizer/node-cli/package.json`.
   - Add `tokamak-zk-evm` to `packages/frontend/synthesizer/web-app/package.json`.
   - Replace the `synthesizer-web` `zkevm` keyword with the repository-standard `zk-EVM` spelling.
3. Do not add broad unrelated keywords such as `prover` or `verifier` to Synthesizer packages.
4. Do not add deprecated WASM verifier package metadata to the supported package list.
5. After any keyword edits, rerun local package metadata extraction and `npm pack --dry-run` for the changed packages if the package scripts allow it without rebuilding unrelated artifacts.

### Deprecated WASM Verifier Treatment

Status: started through root-facing documentation, but not fully applied across the deprecated package documentation.

Current state:

- Root README already answers that the WASM verifier packages are deprecated and should be treated only as historical or reference material.
- Root `llms.txt` does not list the WASM verifier packages as supported public packages.
- `packages/backend/verify/verify-wasm/README.md`, `QUICK_START.md`, and `NPM_USAGE.md` still read like active user-facing package documentation.
- `packages/backend/verify/verify-wasm/package.json` still has a normal package description and keywords that make it look like an active verifier package surface.

Target files:

- `packages/backend/verify/verify-wasm/README.md`
- `packages/backend/verify/verify-wasm/QUICK_START.md`
- `packages/backend/verify/verify-wasm/NPM_USAGE.md`
- `packages/backend/verify/verify-wasm/package.json`

Concrete implementation plan:

1. Add a deprecation notice at the top of each WASM verifier Markdown document.
   - Start with a direct user-facing sentence: `This package family is deprecated and is not an officially supported Tokamak zk-EVM package surface.`
   - State that the content is retained only for historical or reference material.
   - State that new integrations should not use these packages.
2. Add the supported replacement paths before any install or usage examples:
   - Local verification: use `@tokamak-zk-evm/cli` and the backend verification flow.
   - On-chain verification: use the Solidity verifier contracts in `tokamak-network/Tokamak-zk-EVM-contracts` and the published deployment artifacts.
3. Demote existing install and usage examples in `README.md`, `QUICK_START.md`, and `NPM_USAGE.md`.
   - Keep examples only under a section named `Historical Usage` or `Reference Usage`.
   - Do not present `@tokamak-zk-evm/verify-wasm-web`, `@tokamak-zk-evm/verify-wasm-nodejs`, or `@tokamak-zk-evm/verify-wasm-bundler` as recommended packages.
4. Update `packages/backend/verify/verify-wasm/package.json`.
   - Change the description so it starts with `Deprecated`.
   - Add `deprecated` and `historical` keywords if keyword edits are useful.
   - Do not add this package to root `llms.txt`, root package chooser tables, or supported package lists.
5. Preserve build scripts and source files unless a separate maintenance task explicitly asks to remove them.
   - This task is a documentation and metadata exposure correction, not a code removal.
   - Do not remove examples or scripts unless they are moved under historical/reference wording.
6. Validation after implementation:
   - `rg -n "verify-wasm|verify-wasm-web|verify-wasm-nodejs|verify-wasm-bundler|WASM verifier" README.md llms.txt packages/backend/verify/verify-wasm`
   - Confirm every active-looking WASM verifier mention in Markdown is preceded by or contained under deprecated/historical/reference wording.
   - Confirm root README and root `llms.txt` still do not list WASM verifier packages as supported package surfaces.
   - Confirm `package.json` remains valid JSON.
   - Run `git diff --check`.

## Not Started

### Root `llms.txt`

No root-level `llms.txt` exists yet.

Required content:

- `@tokamak-zk-evm/cli`
- `@tokamak-zk-evm/subcircuit-library`
- `@tokamak-zk-evm/synthesizer-node`
- `@tokamak-zk-evm/synthesizer-web`

Required canonical links:

- root `README.md`
- `packages/cli/README.md`
- `packages/frontend/qap-compiler/README.md`
- `packages/frontend/synthesizer/README.md`
- `packages/frontend/synthesizer/node-cli/README.md`
- `packages/frontend/synthesizer/web-app/README.md`
- root `CHANGELOG.md`

The root `llms.txt` must not present deprecated WASM verifier packages as officially supported packages.

### Root README Opening Rewrite

The compact first-screen summary has not been added.

Required content:

- What the repository provides.
- Which package to install for each consumer need.
- Where each public package README lives.
- A short note that release notes are centralized in the root changelog.

### Package README "When To Use This Package" Blocks

The package README citation blocks have not been added.

Required package-level blocks:

- CLI: install local runtime, synthesize, preprocess, prove, verify, extract proof.
- Subcircuit library: prebuilt R1CS, WASM, JSON metadata, and witness-generation artifacts.
- Synthesizer Node: file-based Node CLI that reads JSON snapshots and writes JSON artifacts.
- Synthesizer Web: browser-facing API that consumes payload objects or uploaded files.

Deprecated WASM verifier docs, if retained, should be marked as deprecated and should not be presented as an official support surface.

### Documentation Readiness Check

No documentation validation script or release-readiness check has been added for this plan.

Required checks:

- Root `llms.txt` exists.
- Package READMEs linked from `llms.txt` exist.
- Root README contains a monorepo package chooser.
- Root README contains a repository-level FAQ.
- Root README explains the CLI, Synthesizer, subcircuit library, and backend roles for readers with no prior Tokamak zk-EVM background.
- Root README explains Tokamak Layer 2 transactions and links to the `tokamak-l2js` npm package and source repository.
- Root README identifies Tokamak zk-SNARK as the backend proving and verification protocol and links to `An Efficient SNARK for Field-Programmable and RAM Circuits`.
- Root README identifies the Solidity verifier implementation in `tokamak-network/Tokamak-zk-EVM-contracts` and links to the deployed Ethereum mainnet `tokamakVerifier` Etherscan page.
- Root README marks the WASM verifier package family as deprecated if it is mentioned.
- Public package manifests include description, keywords, homepage, repository, bugs, license, and author where applicable.
- Synthesizer README includes the transaction-support Q&A.
- README links to the root changelog remain valid.

### Final Link and Metadata Validation Run

No final validation run has been performed because the implementation work has not been applied yet.

Required validation:

- Verify all README links.
- Verify package metadata after any manifest changes.
- Verify `llms.txt` links resolve to existing files.
- Verify deprecated WASM verifier language is not exposed as a supported package claim.

## Suggested Implementation Order

1. Add root `llms.txt`.
2. Strengthen the root README as the monorepo GitHub exposure surface.
3. Add a concise package chooser and public package table to the top of root `README.md`.
4. Add first-principles explanations of the CLI, Synthesizer, subcircuit library, backend package roles, and Tokamak Layer 2 transactions.
5. Add a repository-level FAQ to root `README.md`, including Tokamak Layer 2 transaction, backend protocol, Solidity verifier, and deprecated WASM verifier answers.
6. Add the Synthesizer Q&A and update package-specific README links if needed.
7. Normalize supported package metadata and mark deprecated surfaces clearly.
8. Add a documentation readiness check.
9. Run link and package metadata validation.

## Acceptance Criteria

- npm package pages expose consistent package names, descriptions, keywords, homepage links, repository links, and issue links.
- GitHub repository readers can identify the correct package within the first screen of the root README.
- The root README is the canonical monorepo-level SEO, AEO, and GEO surface and includes a concise repository FAQ.
- The root README explains package roles from first principles and does not assume readers already know the Tokamak zk-EVM architecture.
- The root README explains Tokamak Layer 2 transactions and points readers to `tokamak-l2js` and https://github.com/tokamak-network/TokamakL2JS.
- The root README points readers to the Tokamak zk-SNARK paper `An Efficient SNARK for Field-Programmable and RAM Circuits`.
- The root README points readers to the Solidity verifier implementation in https://github.com/tokamak-network/Tokamak-zk-EVM-contracts and to the Ethereum mainnet verifier deployment at https://etherscan.io/address/0x0C467a5082323Cc6F4b7077A9dFb0bbdaf6eC626.
- Deprecated WASM verifier packages are not presented as officially supported packages.
- LLM tools can find canonical package docs from a root-level `llms.txt`.
- The Synthesizer docs clearly distinguish accepted input shape from full arbitrary-transaction support.
- The transaction-support Q&A is present in the Synthesizer documentation and does not overclaim current implementation coverage.

## Appendix A: Repository FAQ Source Text

```md
## Repository FAQ

### What is Tokamak zk-EVM?

Tokamak zk-EVM is a monorepo for turning Tokamak Layer 2 transaction execution into zk-SNARK proof artifacts. It contains the command-line package, the transaction Synthesizer packages, the prebuilt subcircuit library package, and the Rust backend code for setup, proving, and verification.

### What is a Tokamak Layer 2 transaction?

A Tokamak Layer 2 transaction is the transaction format used by Tokamak's L2 execution model. In Tokamak zk-EVM, it is the unit of execution that the Synthesizer replays from a transaction snapshot: the snapshot carries the L2 transaction data, sender/signature material, calldata, previous state, contract code, and block context needed to reconstruct the transition and produce proof inputs. The TypeScript toolkit for Tokamak L2 transactions, state snapshots, and ZKP-friendly cryptography is `tokamak-l2js`: https://www.npmjs.com/package/tokamak-l2js. Its source repository is https://github.com/tokamak-network/TokamakL2JS.

### What are the main package groups in this monorepo?

The monorepo has four main supported package groups. The CLI package is the end-to-end user entry point. The Synthesizer packages convert Tokamak L2 transaction replay data into circuit-ready inputs. The subcircuit library package publishes the prebuilt R1CS, WASM witness-generation artifacts, and metadata consumed by the Synthesizer and backend. The backend packages implement setup, proof generation, and proof verification for the Tokamak zk-SNARK proving system.

### Which npm package should I install?

If you are new to Tokamak zk-EVM or want the complete local workflow, install `@tokamak-zk-evm/cli`. It is the main package for installing the local runtime and running synthesize, preprocess, prove, verify, and proof extraction commands. Use `@tokamak-zk-evm/synthesizer-node` only when you specifically need the file-based Node.js Synthesizer package. Use `@tokamak-zk-evm/synthesizer-web` only when you need browser-facing synthesis APIs. Use `@tokamak-zk-evm/subcircuit-library` only when you need to consume the published prebuilt subcircuit artifacts directly.

### What does `tokamak-cli` do?

`tokamak-cli` installs and prepares the local Tokamak zk-EVM runtime, runs synthesis from Tokamak L2 transaction snapshots, runs backend preprocessing and proving, verifies proof artifacts, and can extract proof bundles for later verification.

### What is the subcircuit library?

The subcircuit library is the published package of prebuilt circuit artifacts used by Tokamak zk-EVM. It contains R1CS artifacts, WASM witness-generation artifacts, JSON metadata, and related files that let the Synthesizer and backend use a consistent circuit library without rebuilding every circuit from source.

### What does the Synthesizer do?

The Synthesizer takes a Tokamak L2 transaction replay payload and turns it into the artifacts required by the proving pipeline. Its input includes previous state, transaction data, block information, and contract code. Its output includes circuit placement data, public instances, permutation data, final state data, and execution analysis files.

### What backend proving and verification protocol does Tokamak zk-EVM use?

The backend proving and verification packages are based on Tokamak zk-SNARK. The protocol is described in `An Efficient SNARK for Field-Programmable and RAM Circuits` by Jehyuk Jang and Jamie Judd, IACR Cryptology ePrint Archive 2024/507: https://eprint.iacr.org/2024/507.

### Is there an on-chain Solidity verifier implementation?

Yes. The on-chain Solidity verifier implementation lives in the `tokamak-network/Tokamak-zk-EVM-contracts` repository: https://github.com/tokamak-network/Tokamak-zk-EVM-contracts. The Tokamak verifier contract source is `bridge/src/verifiers/TokamakVerifier.sol`: https://github.com/tokamak-network/Tokamak-zk-EVM-contracts/blob/main/bridge/src/verifiers/TokamakVerifier.sol. The current Ethereum mainnet deployment artifact lists `tokamakVerifier` at `0x0C467a5082323Cc6F4b7077A9dFb0bbdaf6eC626`, which can be inspected on Etherscan: https://etherscan.io/address/0x0C467a5082323Cc6F4b7077A9dFb0bbdaf6eC626.

### What is the difference between `synthesizer-node` and `synthesizer-web`?

`@tokamak-zk-evm/synthesizer-node` is a Node.js CLI package that reads JSON files from disk and writes synthesized JSON artifacts back to disk. `@tokamak-zk-evm/synthesizer-web` is a browser-facing package that accepts payload objects or uploaded files and bundles the subcircuit library assets at build time.

### Does the Synthesizer support complex contract-call transactions?

Partially, yes. The Synthesizer is not limited to simple native transfers or a hardcoded ERC20 transfer template. It accepts a complete transaction replay payload, including transaction data, contract code, previous state, and block information, then follows the Tokamak L2/EVM execution path to produce circuit-ready artifacts. For complex contracts, support is not determined by whether the transaction is an ERC20 transfer, a native transfer, or another simple transaction type. Instead, support depends on whether the execution stays within the opcode set, call flows, storage/memory/log handling, and runtime model currently supported by Tokamak zk-EVM.

### Is Tokamak zk-EVM intended for arbitrary Ethereum L1 execution?

No. Tokamak zk-EVM is designed under the strict assumption that it is used in Ethereum Layer 2 execution. Features outside that target runtime model are intentionally excluded from the consumer support claim.

### Which features are intentionally scoped out?

Transactions that require unsupported behavior, such as contract creation, precompiled contracts, transient storage, blob opcodes, invalid/selfdestruct paths, or other unvalidated opcode/control-flow combinations, are outside the supported consumer claim. These limitations are intentional scope boundaries rather than underdevelopment or future work.

### Are the WASM verifier packages officially supported?

No. The WASM verifier packages are deprecated. For local verification, use the supported CLI and backend verification flow. For on-chain verification, use the Solidity verifier contracts in `tokamak-network/Tokamak-zk-EVM-contracts` and the deployed verifier addresses published with the bridge artifacts. The WASM verifier packages should be treated only as historical or reference material.

### Where are release notes maintained?

Release notes are maintained in the root `CHANGELOG.md`. Package artifacts do not include package-local changelog files; package READMEs link back to the root changelog as the canonical release-note source.
```

## Appendix B: Synthesizer Q&A Source Text

```text
Q: Does the current implementation support any arbitrary transaction/call data, or is it limited to simple token/native transfers for now?

A: Partially, yes.

The Synthesizer is not limited to simple native transfers or a hardcoded ERC20 transfer template. It accepts a complete transaction replay payload, including transaction data, contract code, previous state, and block information, then follows the Tokamak L2/EVM execution path to produce circuit-ready artifacts. In practical terms, this means it can be used for contract-call transactions, including calls into contracts with non-trivial internal logic, as long as the execution stays within the currently supported opcode set and runtime model.

For complex contracts, support is not determined by whether the transaction is an ERC20 transfer, a native transfer, or another simple transaction type. Instead, support depends on whether the execution stays within the opcode set, call flows, storage/memory/log handling, and runtime model currently supported by Tokamak zk-EVM. The current implementation includes broad support for arithmetic, calldata handling, memory, storage reads and writes, logs, block/environment opcodes, and message-call flows such as CALL, CALLCODE, DELEGATECALL, and STATICCALL. Current examples and validation coverage focus on ERC20 transfer flows and private-state mint, transfer, and redeem flows, so those are the strongest documented support cases today.

However, it should not yet be described as supporting every arbitrary Ethereum transaction. Transactions that require unsupported behavior, such as contract creation, precompiled contracts, transient storage, blob opcodes, invalid/selfdestruct paths, or other unvalidated opcode/control-flow combinations, are outside the supported consumer claim. These limitations are under intentional scope boundaries rather than underdevelopment or future works. Tokamak zk-EVM is designed under the strict assumption that it is used in Ethereum Layer 2 execution, so features that are outside that target runtime model are intentionally excluded from the consumer support claim.
```
