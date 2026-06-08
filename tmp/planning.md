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
- Some package metadata is less consistent across package families, especially the WASM verifier packages.
- Synthesizer docs do not clearly state the practical transaction-support boundary between "arbitrary calldata accepted as input" and "arbitrary transaction behavior fully supported and validated."

## Plan

### 1. Add a root-level `llms.txt`

Create a repository-root `llms.txt` that summarizes the canonical public surfaces:

- `@tokamak-zk-evm/cli`
- `@tokamak-zk-evm/subcircuit-library`
- `@tokamak-zk-evm/synthesizer-node`
- `@tokamak-zk-evm/synthesizer-web`
- `@tokamak-zk-evm/verify-wasm-web`
- `@tokamak-zk-evm/verify-wasm-nodejs`
- `@tokamak-zk-evm/verify-wasm-bundler`

The file should link only to canonical entry points:

- root `README.md`
- `packages/cli/README.md`
- `packages/frontend/qap-compiler/README.md`
- `packages/frontend/synthesizer/README.md`
- `packages/frontend/synthesizer/node-cli/README.md`
- `packages/frontend/synthesizer/web-app/README.md`
- `packages/backend/verify/verify-wasm/README.md`
- root `CHANGELOG.md`

### 2. Strengthen the monorepo root exposure surface

Treat the repository root as the canonical GitHub SEO, AEO, and GEO surface for the monorepo. Package README files remain the detailed package-specific surfaces, but GitHub users and answer engines will usually encounter the root README first.

Update the root README to include:

- A concise repository summary.
- A first-screen package chooser.
- A public package table with npm links, package roles, and package README links.
- A repository-level FAQ for answer extraction.
- Links to package-specific README files for detailed usage.
- A clear statement that the root `CHANGELOG.md` is the canonical release-note source.

The repository-level FAQ should answer monorepo-level questions, not duplicate every package README. Recommended questions:

- What is Tokamak zk-EVM?
- Which npm package should I install?
- What does `tokamak-cli` do?
- What is the difference between `synthesizer-node` and `synthesizer-web`?
- Does the Synthesizer support complex contract-call transactions?
- Is Tokamak zk-EVM intended for arbitrary Ethereum L1 execution?
- Which features are intentionally scoped out because Tokamak zk-EVM targets Ethereum Layer 2 execution?
- Where are release notes maintained?

Recommended FAQ source text:

```md
## Repository FAQ

### What is Tokamak zk-EVM?

Tokamak zk-EVM is a monorepo for converting Tokamak Layer 2 transaction execution into zk-SNARK proof artifacts. It includes the CLI, Synthesizer packages, prebuilt subcircuit library package, backend proving and verification code, and WASM verifier packages.

### Which npm package should I install?

Use `@tokamak-zk-evm/cli` if you want the main end-to-end command-line flow for install, synthesize, preprocess, prove, verify, and proof extraction. Use `@tokamak-zk-evm/synthesizer-node` for file-based Node.js synthesis, `@tokamak-zk-evm/synthesizer-web` for browser-facing synthesis, and `@tokamak-zk-evm/subcircuit-library` when you need the published prebuilt subcircuit artifacts directly.

### What does `tokamak-cli` do?

`tokamak-cli` installs and prepares the local Tokamak zk-EVM runtime, runs synthesis from Tokamak L2 transaction snapshots, runs backend preprocessing and proving, verifies proof artifacts, and can extract proof bundles for later verification.

### What is the difference between `synthesizer-node` and `synthesizer-web`?

`@tokamak-zk-evm/synthesizer-node` is a Node.js CLI package that reads JSON files from disk and writes synthesized JSON artifacts back to disk. `@tokamak-zk-evm/synthesizer-web` is a browser-facing package that accepts payload objects or uploaded files and bundles the subcircuit library assets at build time.

### Does the Synthesizer support complex contract-call transactions?

Partially, yes. The Synthesizer is not limited to simple native transfers or a hardcoded ERC20 transfer template. It accepts a complete transaction replay payload, including transaction data, contract code, previous state, and block information, then follows the Tokamak L2/EVM execution path to produce circuit-ready artifacts. For complex contracts, the support boundary is feature-based rather than token-transfer-based: execution must stay within the currently supported opcode set and runtime model.

### Is Tokamak zk-EVM intended for arbitrary Ethereum L1 execution?

No. Tokamak zk-EVM is designed under the strict assumption that it is used in Ethereum Layer 2 execution. Features outside that target runtime model are intentionally excluded from the consumer support claim.

### Which features are intentionally scoped out?

Transactions that require unsupported behavior, such as contract creation, precompiled contracts, transient storage, blob opcodes, invalid/selfdestruct paths, or other unvalidated opcode/control-flow combinations, are outside the supported consumer claim. These limitations are intentional scope boundaries rather than underdevelopment or future work.

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
- Align source package metadata with the actual published package names for the WASM verifier package family.

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

For complex contracts, the support boundary is feature-based rather than token-transfer-based. The current implementation includes broad support for arithmetic, calldata handling, memory, storage reads and writes, logs, block/environment opcodes, and message-call flows such as CALL, CALLCODE, DELEGATECALL, and STATICCALL. Current examples and validation coverage focus on ERC20 transfer flows and private-state mint, transfer, and redeem flows, so those are the strongest documented support cases today.

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
- Verify WASM: browser, Node.js, and bundler verifier packages.

This improves answer-engine extraction without requiring structured website markup.

### 7. Add validation checks for documentation discoverability

Extend existing release/readiness checks or add a small documentation validation script that verifies:

- Root `llms.txt` exists.
- Package READMEs linked from `llms.txt` exist.
- Root README contains a monorepo package chooser.
- Root README contains a repository-level FAQ.
- Public package manifests include description, keywords, homepage, repository, bugs, license, and author where applicable.
- Synthesizer README includes the transaction-support Q&A.
- README links to the root changelog remain valid.

## Suggested Implementation Order

1. Add root `llms.txt`.
2. Strengthen the root README as the monorepo GitHub exposure surface.
3. Add a concise package chooser and public package table to the top of root `README.md`.
4. Add a repository-level FAQ to root `README.md`.
5. Add the Synthesizer Q&A and update package-specific README links if needed.
6. Normalize package metadata, especially the verifier package family.
7. Add a documentation readiness check.
8. Run link and package metadata validation.

## Acceptance Criteria

- npm package pages expose consistent package names, descriptions, keywords, homepage links, repository links, and issue links.
- GitHub repository readers can identify the correct package within the first screen of the root README.
- The root README is the canonical monorepo-level SEO, AEO, and GEO surface and includes a concise repository FAQ.
- LLM tools can find canonical package docs from a root-level `llms.txt`.
- The Synthesizer docs clearly distinguish accepted input shape from full arbitrary-transaction support.
- The transaction-support Q&A is present in the Synthesizer documentation and does not overclaim current implementation coverage.
