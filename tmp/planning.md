# SEO, AEO, and GEO Exposure Improvement Plan

## Scope

This plan targets package and GitHub repository discoverability only. It does not assume or require a marketing website.

The goal is to improve:

- SEO for npm and GitHub search surfaces.
- AEO for answer engines that read package README files, GitHub repository metadata, and generated summaries.
- GEO for LLM-oriented retrieval over repository documentation.

## Status Summary

This document tracks the repository exposure work in three states:

- Completed: work implemented in the repository, validated locally, or completed as source-text planning.
- Started but incomplete: work that has partial implementation or partial validation remaining.
- Not started: work listed in the plan but not yet materially started.

Current status: all concrete repository documentation and metadata tasks in this plan have been implemented and validated locally with `npm run docs:check`.

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

### Root README Exposure Upgrade

The root `README.md` has been strengthened as the canonical GitHub SEO, AEO, and GEO surface for the monorepo.

Implemented content:

- A concise repository summary near the top of the root README.
- A first-screen package chooser.
- A public package table with package roles and package README links.
- Canonical documentation links, including package README files, root `llms.txt`, and root `CHANGELOG.md`.
- A repository-level FAQ based on Appendix A.
- First-principles explanations of the CLI, Synthesizer, subcircuit library, and backend package groups.
- A Tokamak Layer 2 transaction explanation with `tokamak-l2js` package and repository references.
- A backend protocol note pointing to `An Efficient SNARK for Field-Programmable and RAM Circuits`.
- A Solidity verifier note with the contracts repository, `TokamakVerifier.sol`, and Etherscan deployment links.
- A user-facing note that the WASM verifier packages are deprecated.

### Root FAQ Source Text

Repository-level FAQ source text has been drafted in this plan and implemented in the root `README.md`.

The implemented FAQ covers:

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

### Synthesizer AEO Content

The consumer-facing Synthesizer Q&A answer has been drafted in this plan and implemented in `packages/frontend/synthesizer/README.md`.

Implemented content:

- The answer starts with `Partially, yes.`
- The Synthesizer is not limited to simple native transfers or a hardcoded ERC20 transfer template.
- Complex contract-call support depends on the execution staying within the supported opcode set, call flows, storage/memory/log handling, and runtime model.
- Current strongest documented support cases are ERC20 transfer flows and private-state mint, transfer, and redeem flows.
- Unsupported Ethereum behaviors are outside the consumer support claim because Tokamak zk-EVM is designed for Ethereum Layer 2 execution, not arbitrary Ethereum L1 execution.
- `packages/frontend/synthesizer/node-cli/README.md` links to the shared workspace transaction-support FAQ.
- `packages/frontend/synthesizer/web-app/README.md` links to the shared workspace transaction-support FAQ.

The full draft is preserved in [Appendix B](#appendix-b-synthesizer-qa-source-text).

### External Reference Targets

The key external reference targets have been identified and used in the root README implementation:

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

### Package Metadata Normalization

The four supported public package manifests have the required exposure metadata fields:

- `description`
- `keywords`
- `homepage`
- `repository`
- `bugs`
- `license`
- `author`

Completed keyword normalization:

- `packages/frontend/synthesizer/node-cli/package.json` includes `tokamak-zk-evm`.
- `packages/frontend/synthesizer/web-app/package.json` includes `tokamak-zk-evm`.
- `packages/frontend/synthesizer/web-app/package.json` uses the repository-standard `zk-EVM` spelling instead of `zkevm`.
- Deprecated WASM verifier packages were not added to supported package lists.

Inspection result:

| Package | Required fields | Required manifest change | Keyword result |
| --- | --- | --- | --- |
| `@tokamak-zk-evm/cli` | `description`, `keywords`, `homepage`, `repository.directory`, `bugs`, `license`, and `author` are present. | No required change. | No keyword change was needed. The current keywords are package-specific and include `tokamak-zk-evm`, `tokamak-network`, `prover`, `zk-EVM`, and `zk-SNARK`. |
| `@tokamak-zk-evm/subcircuit-library` | `description`, `keywords`, `homepage`, `repository.directory`, `bugs`, `license`, and `author` are present. | No required change. | No keyword change was needed. The `wasm` keyword is appropriate because this package publishes WASM witness-generation artifacts, not a verifier package surface. |
| `@tokamak-zk-evm/synthesizer-node` | `description`, `keywords`, `homepage`, `repository.directory`, `bugs`, `license`, and `author` are present. | Keyword normalization completed. | `tokamak-zk-evm` was added. Broad unrelated `prover` or `verifier` keywords were not added. |
| `@tokamak-zk-evm/synthesizer-web` | `description`, `keywords`, `homepage`, `repository.directory`, `bugs`, `license`, and `author` are present. | Keyword normalization completed. | `tokamak-zk-evm` was added and `zkevm` was normalized to `zk-EVM`. `browser` and `wasm` were retained because they describe this package's browser-facing bundled-artifact model. |

### Deprecated WASM Verifier Treatment

The deprecated WASM verifier package family has been corrected so it is not presented as an active supported package surface.

Implemented content:

- Root README answers that the WASM verifier packages are deprecated and should be treated only as historical or reference material.
- Root `llms.txt` does not list the WASM verifier packages as supported public packages.
- `packages/backend/verify/verify-wasm/README.md` starts with the approved deprecation notice.
- `packages/backend/verify/verify-wasm/QUICK_START.md` starts with the approved deprecation notice.
- `packages/backend/verify/verify-wasm/NPM_USAGE.md` starts with the approved deprecation notice.
- Existing usage examples are retained only as historical or reference material.
- `packages/backend/verify/verify-wasm/package.json` has a description that starts with `Deprecated`.
- `packages/backend/verify/verify-wasm/package.json` includes `deprecated` and `historical` keywords.

### Root `llms.txt`

Root `llms.txt` has been added.

Implemented content:

- `@tokamak-zk-evm/cli`
- `@tokamak-zk-evm/subcircuit-library`
- `@tokamak-zk-evm/synthesizer-node`
- `@tokamak-zk-evm/synthesizer-web`
- Root `README.md`
- `packages/cli/README.md`
- `packages/frontend/qap-compiler/README.md`
- `packages/frontend/synthesizer/README.md`
- `packages/frontend/synthesizer/node-cli/README.md`
- `packages/frontend/synthesizer/web-app/README.md`
- Root `CHANGELOG.md`

The root `llms.txt` does not present deprecated WASM verifier packages as officially supported packages.

### Root README Opening Rewrite

The compact first-screen summary has been added to the root `README.md`.

Implemented content:

- What the repository provides.
- Which package to install for each consumer need.
- Where each public package README lives.
- A short note that release notes are centralized in the root changelog.

### Package README "When To Use This Package" Blocks

Package README "When to use this package" blocks have been added.

Implemented package-level blocks:

- CLI: install local runtime, synthesize, preprocess, prove, verify, extract proof.
- Subcircuit library: prebuilt R1CS, WASM, JSON metadata, and witness-generation artifacts.
- Synthesizer Node: file-based Node CLI that reads JSON snapshots and writes JSON artifacts.
- Synthesizer Web: browser-facing API that consumes payload objects or uploaded files.

### Documentation Readiness Check

A documentation validation script has been added at `scripts/check-doc-readiness.mjs`, and the root `package.json` exposes it as `npm run docs:check`.

Implemented checks:

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

Local validation has been performed.

Completed validation:

- `npm run docs:check` passes.
- `git diff --check` passes after implementation commits.
- Root `llms.txt` local links resolve through the documentation readiness script.
- Supported public package manifests expose the required metadata fields.
- Deprecated WASM verifier language is not exposed as a supported package claim in root `README.md` or root `llms.txt`.

## Started But Incomplete

No implementation item from this plan is currently started but incomplete.

Optional follow-up outside this plan:

- Re-check live npm package pages after the next publish, because npm search and package-page exposure update only after publication.
- Re-check GitHub repository topics and repository description if repository ownership, package names, or positioning changes.

## Not Started

No implementation item from this plan remains unstarted.

## Implemented Order

1. Added root `llms.txt`.
2. Strengthened the root README as the monorepo GitHub exposure surface.
3. Added a concise package chooser and public package table to the top of root `README.md`.
4. Added first-principles explanations of the CLI, Synthesizer, subcircuit library, backend package roles, and Tokamak Layer 2 transactions.
5. Added a repository-level FAQ to root `README.md`, including Tokamak Layer 2 transaction, backend protocol, Solidity verifier, and deprecated WASM verifier answers.
6. Added the Synthesizer Q&A and package-specific README links.
7. Normalized supported Synthesizer package metadata and marked deprecated WASM verifier surfaces clearly.
8. Added a documentation readiness check.
9. Ran documentation readiness validation.

## Acceptance Criteria Status

- Met: npm package manifests expose consistent package names, descriptions, keywords, homepage links, repository links, and issue links.
- Met: GitHub repository readers can identify the correct package within the first screen of the root README.
- Met: The root README is the canonical monorepo-level SEO, AEO, and GEO surface and includes a concise repository FAQ.
- Met: The root README explains package roles from first principles and does not assume readers already know the Tokamak zk-EVM architecture.
- Met: The root README explains Tokamak Layer 2 transactions and points readers to `tokamak-l2js` and https://github.com/tokamak-network/TokamakL2JS.
- Met: The root README points readers to the Tokamak zk-SNARK paper `An Efficient SNARK for Field-Programmable and RAM Circuits`.
- Met: The root README points readers to the Solidity verifier implementation in https://github.com/tokamak-network/Tokamak-zk-EVM-contracts and to the Ethereum mainnet verifier deployment at https://etherscan.io/address/0x0C467a5082323Cc6F4b7077A9dFb0bbdaf6eC626.
- Met: Deprecated WASM verifier packages are not presented as officially supported packages.
- Met: LLM tools can find canonical package docs from a root-level `llms.txt`.
- Met: The Synthesizer docs clearly distinguish accepted input shape from full arbitrary-transaction support.
- Met: The transaction-support Q&A is present in the Synthesizer documentation and does not overclaim current implementation coverage.

## Preserved Deprecated WASM Verifier Wording

```md
> Deprecated: The WASM verifier packages are no longer officially supported.
>
> This document is retained only as historical and reference material. Do not use the WASM verifier packages for new integrations. For local verification, use `@tokamak-zk-evm/cli` and the supported backend verification flow. For on-chain verification, use the Solidity verifier contracts in `tokamak-network/Tokamak-zk-EVM-contracts` and the published deployment artifacts.
```

Approved short notice for repeated sections:

```md
Deprecated historical example. New integrations should use `@tokamak-zk-evm/cli` for local verification or the Solidity verifier contracts for on-chain verification.
```

Approved `package.json` description:

```json
"description": "Deprecated historical WASM verifier package for Tokamak zk-EVM. Use @tokamak-zk-evm/cli for local verification or the Solidity verifier contracts for on-chain verification."
```

Forbidden wording in consumer-facing documentation:

- Do not write maintainer instructions such as `should not be presented as an officially supported package surface`.
- Do not describe the docs as if the target reader is the maintainer, the planner, or this task's reviewer.
- Do not use ambiguous phrases such as `underdevelopment`, `future work`, or `not normalized as support` for this package family.
- Do not imply that the WASM verifier packages are recommended, current, supported, or the preferred verification path.
- Do not put install commands before the deprecation notice and replacement paths.

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
