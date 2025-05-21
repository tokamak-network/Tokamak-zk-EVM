# Tokamak zkEVM Contracts

This repository implements the zkSNARK on-chain verifier used by the consensus contract when proving batches.

## Test Suite

The contracts are rigorously tested with:

### Tests
- **Proof Verification**: Valid/invalid proof handling
- **Gas Benchmarking**: Verification cost analysis


## Getting Started

### Prerequisites
- Foundry (forge, anvil, cast)
- Node.js 16+
- Solidity 0.8.23

### Installation

```bash
cd "$pwd/packages/backend/verify/solidity"
forge install
forge test -vvvv
```