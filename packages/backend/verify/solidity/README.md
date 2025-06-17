# Tokamak zkEVM Contracts

A Solidity implementation of zkSNARK on-chain verifiers for the Tokamak zkEVM consensus layer. This repository contains smart contracts that verify zero-knowledge proofs submitted during batch processing, ensuring the validity of state transitions without revealing the underlying computations.

## Overview

The Tokamak zkEVM verifier contracts serve as the cryptographic backbone for Layer 2 batch verification. When sequencers submit batches of transactions, they must provide zkSNARK proofs that demonstrate the correctness of state transitions. These contracts efficiently verify those proofs on-chain, enabling trustless validation of L2 state updates.

### Key Features
- **On-chain zkSNARK verification** for batch proofs
- **Gas-optimized** implementation for cost-effective verification
- **Modular architecture** supporting multiple proof systems
- **Comprehensive test coverage** including edge cases and gas benchmarks

## Prerequisites

### System Requirements
- **Operating System**: Linux, macOS, or WSL2 (Windows)
- **Memory**: Minimum 8GB RAM recommended
- **Disk Space**: At least 2GB free space

### Required Software

#### 1. Foundry Toolkit
Foundry is a blazing fast, portable and modular toolkit for Ethereum development.

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash

# Follow the instructions to add Foundry to your PATH, then run:
foundryup

# Verify installation
forge --version
cast --version
anvil --version
```

#### 2. Node.js and npm
Required for additional tooling and dependencies.

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 16
nvm use 16

# Or using your system's package manager
# macOS with Homebrew
brew install node@16

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v16.x.x
npm --version
```

#### 3. Solidity Compiler
The project uses Solidity 0.8.23. Foundry will handle the compiler installation automatically, but you can also install it manually:

```bash
# Via npm (optional)
npm install -g solc@0.8.23

# Verify the compiler version in foundry.toml
```

## Installation

1. **Navigate to the contracts directory**
   ```bash
   cd packages/backend/verify/solidity
   ```

2. **Install Foundry dependencies**
   ```bash
   forge install
   ```

3. **Build the contracts**
   ```bash
   forge build
   ```

## Running Tests

The test suite includes comprehensive coverage for proof verification scenarios and gas consumption analysis.

### Run all tests with verbose output
```bash
forge test -vvv
```

### Run specific test suites
```bash
# Run only proof verification tests
forge test --match-test testVerifierV2 -vvv

# Run gas benchmark tests
forge test --match-test testVerifierV3 -vvv
```

### Generate gas reports
```bash
forge test --gas-report
```

## Test Suite Details

### Proof Verification Tests
- **Valid Proof Handling**: Ensures correct proofs are accepted
- **Invalid Proof Rejection**: Verifies malformed or incorrect proofs are rejected
- **Edge Cases**: Tests boundary conditions and extreme inputs
- **Attack Vectors**: Validates resistance to known attack patterns

### Gas Benchmarking
- **Verification Cost Analysis**: Measures gas consumption for different proof sizes
- **Optimization Validation**: Ensures gas optimizations work as expected
- **Comparative Analysis**: Benchmarks against reference implementations

## Project Structure

```
packages/backend/verify/solidity/
├── src/
│   ├── VerifierV1.sol       # Unoptimized verifier contract
│   ├── VerifierV2.sol       # Unoptimized verifier contract
│   ├── VerifierV3.sol       # Main verifier contract
│   ├── interfaces/          # Contract interfaces
├── test/
│   ├── Verifier.t.sol       # Core verification tests
├── script/                  # Deployment scripts
│   ├── DeployScript.sol     # Helper script for deploying a verifier
│   ├── Verify.s.sol         # Helper script for interacting with a deployed verifier
├── foundry.toml            # Foundry configuration
└── README.md               # This file
```

## Development


### Code Style and Linting
```bash
# Format Solidity code
forge fmt

# Check formatting
forge fmt --check
```

## Security

This implementation handles critical consensus operations. If you discover a security vulnerability, please report it responsibly to [security@tokamak.network](mailto:mehdi@tokamak.network).

## License

This project is licensed under the [MIT](LICENSE) file in the repository.

