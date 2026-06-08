# SEO, AEO, and GEO Exposure Improvement Plan

## Scope

This plan targets package and GitHub repository discoverability only. It does not assume or require a marketing website.

The goal is to improve:

- SEO for npm and GitHub search surfaces.
- AEO for answer engines that read package README files, GitHub repository metadata, and generated summaries.
- GEO for LLM-oriented retrieval over repository documentation.

## Current Assessment

The repository already has a solid base for package and GitHub exposure:

- The main public npm packages define descriptions, keywords, repository metadata, package-specific homepage links, and issue links.
- The GitHub repository is public and has a useful description, README homepage, and relevant topics.
- Package READMEs are structured around install, usage, package role, runtime model, and common questions.
- `packages/frontend/synthesizer/llms.txt` exists and gives an LLM-readable map for the Synthesizer workspace.

The main gaps are:

- There is no root-level `llms.txt` for the whole repository and all public package surfaces.
- The root README is long, and the package chooser is not the first thing an answer engine sees.
- The root README does not currently provide a repository-level FAQ, even though the repository root is the primary GitHub discovery surface for this monorepo.
- The root README currently assumes readers already understand the package roles. It should instead explain the CLI, Synthesizer, subcircuit library, and backend packages from first principles.
- The WASM verifier package family is deprecated and should no longer be presented as an officially supported public package surface.
- Synthesizer docs do not clearly state the practical transaction-support boundary between "arbitrary calldata accepted as input" and "arbitrary transaction behavior fully supported and validated."

## Plan

### 1. Add a root-level `llms.txt`

Create a repository-root `llms.txt` that summarizes the canonical public surfaces:

- `@tokamak-zk-evm/cli`
- `@tokamak-zk-evm/subcircuit-library`
- `@tokamak-zk-evm/synthesizer-node`
- `@tokamak-zk-evm/synthesizer-web`

The root `llms.txt` should not present the deprecated WASM verifier packages as officially supported packages. If they are mentioned, the entry must be clearly marked as deprecated and historical.

The file should link only to canonical entry points:

- root `README.md`
- `packages/cli/README.md`
- `packages/frontend/qap-compiler/README.md`
- `packages/frontend/synthesizer/README.md`
- `packages/frontend/synthesizer/node-cli/README.md`
- `packages/frontend/synthesizer/web-app/README.md`
- root `CHANGELOG.md`

### 2. Strengthen the monorepo root exposure surface

Treat the repository root as the canonical GitHub SEO, AEO, and GEO surface for the monorepo. Package README files remain the detailed package-specific surfaces, but GitHub users and answer engines will usually encounter the root README first.

Update the root README to include:

- A concise repository summary.
- A first-screen package chooser.
- A public package table with npm links, package roles, and package README links.
- A repository-level FAQ for answer extraction.
- A first-principles explanation of each package group for readers with no Tokamak zk-EVM background.
- A first-principles explanation of Tokamak Layer 2 transactions, with links to the `tokamak-l2js` npm package and source repository.
- A backend protocol note that identifies Tokamak zk-SNARK and points to the paper `An Efficient SNARK for Field-Programmable and RAM Circuits`.
- A Solidity verifier note that points to `tokamak-network/Tokamak-zk-EVM-contracts`, the `TokamakVerifier.sol` implementation, and the deployed Ethereum mainnet verifier on Etherscan.
- A clear note that the WASM verifier package family is deprecated and is not part of the officially supported package surface.
- Links to package-specific README files for detailed usage.
- A clear statement that the root `CHANGELOG.md` is the canonical release-note source.

The repository-level FAQ should answer monorepo-level questions, not duplicate every package README. Recommended questions:

- What is Tokamak zk-EVM?
- What is a Tokamak Layer 2 transaction?
- What are the main package groups in this monorepo?
- Which npm package should I install?
- What does `tokamak-cli` do?
- What is the subcircuit library?
- What does the Synthesizer do?
- What backend proving and verification protocol does Tokamak zk-EVM use?
- Is there an on-chain Solidity verifier implementation?
- What is the difference between `synthesizer-node` and `synthesizer-web`?
- Does the Synthesizer support complex contract-call transactions?
- Is Tokamak zk-EVM intended for arbitrary Ethereum L1 execution?
- Which features are intentionally scoped out because Tokamak zk-EVM targets Ethereum Layer 2 execution?
- Are the WASM verifier packages officially supported?
- Where are release notes maintained?

Recommended FAQ source text:

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

### 3. Improve the root README opening

Add a compact first-screen summary before the long installation flow:

- What the repository provides.
- Which package to install for each consumer need.
- Where each public package README lives.
- A short note that release notes are centralized in the root changelog.

This should preserve the existing setup detail, but make the repository easier for GitHub search, npm-linked readers, and answer engines to summarize.

### 4. Normalize npm package metadata

Review package metadata for consistency:

- Use consistent keyword coverage for `tokamak-zk-evm`, `tokamak`, `ethereum`, `zero-knowledge`, `zk-snark`, `zk-evm`, `prover`, `verifier`, `wasm`, and `browser` where appropriate.
- Ensure every published package has a repository URL, repository directory where possible, homepage, bugs URL, license, and author.
- Mark deprecated package surfaces, including the WASM verifier package family, clearly as deprecated instead of normalizing them as official public support surfaces.

### 5. Strengthen Synthesizer AEO content

Add a consumer-facing Q&A section to the Synthesizer docs. The section should answer practical integration questions directly, without overstating support.

Recommended location:

- Primary: `packages/frontend/synthesizer/README.md`
- Secondary package-specific references:
  - `packages/frontend/synthesizer/node-cli/README.md`
  - `packages/frontend/synthesizer/web-app/README.md`

The Q&A should include this entry:

```text
Q: Does the current implementation support any arbitrary transaction/call data, or is it limited to simple token/native transfers for now?

A: Partially, yes.

The Synthesizer is not limited to simple native transfers or a hardcoded ERC20 transfer template. It accepts a complete transaction replay payload, including transaction data, contract code, previous state, and block information, then follows the Tokamak L2/EVM execution path to produce circuit-ready artifacts. In practical terms, this means it can be used for contract-call transactions, including calls into contracts with non-trivial internal logic, as long as the execution stays within the currently supported opcode set and runtime model.

For complex contracts, support is not determined by whether the transaction is an ERC20 transfer, a native transfer, or another simple transaction type. Instead, support depends on whether the execution stays within the opcode set, call flows, storage/memory/log handling, and runtime model currently supported by Tokamak zk-EVM. The current implementation includes broad support for arithmetic, calldata handling, memory, storage reads and writes, logs, block/environment opcodes, and message-call flows such as CALL, CALLCODE, DELEGATECALL, and STATICCALL. Current examples and validation coverage focus on ERC20 transfer flows and private-state mint, transfer, and redeem flows, so those are the strongest documented support cases today.

However, it should not yet be described as supporting every arbitrary Ethereum transaction. Transactions that require unsupported behavior, such as contract creation, precompiled contracts, transient storage, blob opcodes, invalid/selfdestruct paths, or other unvalidated opcode/control-flow combinations, are outside the supported consumer claim. These limitations are under intentional scope boundaries rather than underdevelopment or future works. Tokamak zk-EVM is designed under the strict assumption that it is used in Ethereum Layer 2 execution, so features that are outside that target runtime model are intentionally excluded from the consumer support claim.
```

Supporting implementation facts to keep aligned with the docs:

- The public synthesis input contains `previousState`, `transaction`, `blockInfo`, and `contractCodes`.
- The runtime creates a Tokamak L2 transaction from the snapshot and runs it through the VM-backed synthesizer.
- The supported opcode list omits several behaviors, including contract creation and transient storage.
- The synthesizer explicitly rejects create messages and precompiled calls.
- Example and test coverage is currently centered on ERC20 transfer and private-state mint, transfer, and redeem flows.
- The same support boundary should be summarized in the root README FAQ, with the package README holding the more detailed answer.

### 6. Make package docs easier to cite

For each public package README, add a short "When to use this package" block near the top:

- CLI: install local runtime, synthesize, preprocess, prove, verify, extract proof.
- Subcircuit library: prebuilt R1CS, WASM, JSON metadata, and witness-generation artifacts.
- Synthesizer Node: file-based Node CLI that reads JSON snapshots and writes JSON artifacts.
- Synthesizer Web: browser-facing API that consumes payload objects or uploaded files.
- Deprecated WASM verifier: mark as deprecated; do not present it as an official support surface.

This improves answer-engine extraction without requiring structured website markup.

### 7. Add validation checks for documentation discoverability

Extend existing release/readiness checks or add a small documentation validation script that verifies:

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

## Suggested Implementation Order

1. Add root `llms.txt`.
2. Strengthen the root README as the monorepo GitHub exposure surface.
3. Add a concise package chooser and public package table to the top of root `README.md`.
4. Add first-principles explanations of the CLI, Synthesizer, subcircuit library, and backend package roles.
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
