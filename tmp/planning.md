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

### 2. Improve the root README opening

Add a compact first-screen summary before the long installation flow:

- What the repository provides.
- Which package to install for each consumer need.
- Where each public package README lives.
- A short note that release notes are centralized in the root changelog.

This should preserve the existing setup detail, but make the repository easier for GitHub search, npm-linked readers, and answer engines to summarize.

### 3. Normalize npm package metadata

Review package metadata for consistency:

- Use consistent keyword coverage for `tokamak-zk-evm`, `tokamak`, `ethereum`, `zero-knowledge`, `zk-snark`, `zk-evm`, `prover`, `verifier`, `wasm`, and `browser` where appropriate.
- Ensure every published package has a repository URL, repository directory where possible, homepage, bugs URL, license, and author.
- Align source package metadata with the actual published package names for the WASM verifier package family.

### 4. Strengthen Synthesizer AEO content

Add a consumer-facing Q&A section to the Synthesizer docs. The section should answer practical integration questions directly, without overstating support.

Recommended location:

- Primary: `packages/frontend/synthesizer/README.md`
- Secondary package-specific references:
  - `packages/frontend/synthesizer/node-cli/README.md`
  - `packages/frontend/synthesizer/web-app/README.md`

The Q&A should include this entry:

```text
Q: Does the current implementation support any arbitrary transaction/call data, or is it limited to simple token/native transfers for now?

A: The Synthesizer accepts a complete transaction replay payload, including transaction data and contract code, so it is not hardcoded only for simple native or token transfers. However, the current implementation should not be described as supporting every arbitrary Ethereum transaction. It synthesizes execution for the currently supported Tokamak L2/EVM path and supported opcode set. Current examples and validation coverage focus on ERC20 transfer flows and private-state mint, transfer, and redeem flows. Transactions that require unsupported behavior, such as contract creation, precompiled contracts, transient storage, blob opcodes, invalid/selfdestruct paths, or other unvalidated opcode/control-flow combinations, are outside the supported consumer claim until explicit support and tests are added.
```

Supporting implementation facts to keep aligned with the docs:

- The public synthesis input contains `previousState`, `transaction`, `blockInfo`, and `contractCodes`.
- The runtime creates a Tokamak L2 transaction from the snapshot and runs it through the VM-backed synthesizer.
- The supported opcode list omits several behaviors, including contract creation and transient storage.
- The synthesizer explicitly rejects create messages and precompiled calls.
- Example and test coverage is currently centered on ERC20 transfer and private-state mint, transfer, and redeem flows.

### 5. Make package docs easier to cite

For each public package README, add a short "When to use this package" block near the top:

- CLI: install local runtime, synthesize, preprocess, prove, verify, extract proof.
- Subcircuit library: prebuilt R1CS, WASM, JSON metadata, and witness-generation artifacts.
- Synthesizer Node: file-based Node CLI that reads JSON snapshots and writes JSON artifacts.
- Synthesizer Web: browser-facing API that consumes payload objects or uploaded files.
- Verify WASM: browser, Node.js, and bundler verifier packages.

This improves answer-engine extraction without requiring structured website markup.

### 6. Add validation checks for documentation discoverability

Extend existing release/readiness checks or add a small documentation validation script that verifies:

- Root `llms.txt` exists.
- Package READMEs linked from `llms.txt` exist.
- Public package manifests include description, keywords, homepage, repository, bugs, license, and author where applicable.
- Synthesizer README includes the transaction-support Q&A.
- README links to the root changelog remain valid.

## Suggested Implementation Order

1. Add root `llms.txt`.
2. Add a concise package chooser to the top of root `README.md`.
3. Add the Synthesizer Q&A and update package-specific README links if needed.
4. Normalize package metadata, especially the verifier package family.
5. Add a documentation readiness check.
6. Run link and package metadata validation.

## Acceptance Criteria

- npm package pages expose consistent package names, descriptions, keywords, homepage links, repository links, and issue links.
- GitHub repository readers can identify the correct package within the first screen of the root README.
- LLM tools can find canonical package docs from a root-level `llms.txt`.
- The Synthesizer docs clearly distinguish accepted input shape from full arbitrary-transaction support.
- The transaction-support Q&A is present in the Synthesizer documentation and does not overclaim current implementation coverage.
