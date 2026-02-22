# Tokamak-zk-EVM FAQ

## What is Tokamak-zk-EVM?

Tokamak-zk-EVM is a repository and CLI that converts Tokamak Layer 2 transactions into zero-knowledge proofs (zk-SNARKs).

## What does the main CLI do?

`tokamak-cli` orchestrates the full proving flow:

1. Install/setup artifacts (`--install`)
2. Generate transaction-specific inputs (`--synthesize`)
3. Preprocess (`--preprocess`)
4. Prove (`--prove`)
5. Verify (`--verify`)

## Which transaction system is targeted?

The project targets transactions represented through TokamakL2JS (a Tokamak-focused variant of EthereumJS).

## Which major languages and stacks are used?

- Frontend compilers: TypeScript + Circom
- Backend prover/verify/setup: Rust

## What proof system is implemented?

The backend implements Tokamak zk-SNARK components described in the linked manuscript and project docs.

## Where are generated artifacts stored?

Most generated runtime artifacts are stored under `dist/<platform>/resource/...` when running through `tokamak-cli`.

## Is there published package-level usage documentation?

Yes:

- `packages/frontend/synthesizer/README.md`
- `packages/frontend/qap-compiler/README.md`
- `packages/backend/README.md`

## Where should users report vulnerabilities?

Use the process in `SECURITY.md` and avoid public disclosure of exploit details before triage.
