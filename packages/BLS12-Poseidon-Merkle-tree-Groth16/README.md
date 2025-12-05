# Tokamak Groth16 zkSNARK Production Implementation

This directory contains a production-ready Groth16 zero-knowledge SNARK implementation for Tokamak's storage proof verification system, supporting up to 50 participants.

## Architecture

The circuit implements a quaternary Merkle tree using Poseidon4 hashing over the BLS12-381 curve to prove storage state consistency across channel participants.

## Generating Proofs with snarkjs

### Prerequisites

1. Install snarkjs globally:
```bash
npm install -g snarkjs
```

2. Ensure you have the required files:
   - Circuit WASM file: `circuits/build/merkle_tree_circuit_js/merkle_tree_circuit.wasm`
   - Final proving key: `trusted-setup/merkle_tree_circuit_final.zkey`
   - Verification key: `trusted-setup/verification_key.json`

### Input Format

Create an input JSON file with your Merkle tree data:

```json
{
  "merkle_keys": ["1", "2", "3", ...],
  "storage_values": ["100", "200", "300", ...]
}
```

**Note**: All arrays must contain exactly 50 elements (padded with zeros if needed).

### Generate a Proof

1. **Calculate witness**:
```bash
snarkjs wtns calculate circuits/build/merkle_tree_circuit_js/merkle_tree_circuit.wasm input.json witness.wtns
```
This generates `witness.wtns` - a binary file containing all the intermediate values (witness) computed by the circuit for your specific input.

2. **Generate the proof**:
```bash
snarkjs groth16 prove trusted-setup/merkle_tree_circuit_final.zkey witness.wtns proof.json public.json
```

This creates:
- `proof.json`: The zero-knowledge proof
- `public.json`: Public inputs/outputs

### Verify a Proof

Verify the proof using the verification key:

```bash
snarkjs groth16 verify trusted-setup/verification_key.json public.json proof.json
```

### Example Workflow

```bash
# 1. Create input file
echo '{
  "merkle_keys": ["1", "1", "1", ..., "1"],
  "storage_values": ["1", "1", "1", ..., "1"],
}' > input.json

# 2. Calculate witness
snarkjs wtns calculate circuits/build/merkle_tree_circuit_js/merkle_tree_circuit.wasm input.json witness.wtns

# 3. Generate proof
snarkjs groth16 prove trusted-setup/merkle_tree_circuit_final.zkey witness.wtns proof.json public.json

# 4. Verify proof
snarkjs groth16 verify trusted-setup/verification_key.json public.json proof.json
```

### Proof Format

The generated proof follows the Groth16 format for BLS12-381:

```json
{
  "pi_a": ["...", "...", "1"],
  "pi_b": [["...", "..."], ["...", "..."], ["1", "0"]],
  "pi_c": ["...", "...", "1"],
  "protocol": "groth16",
  "curve": "bls12381"
}
```

### Integration with Smart Contracts

The verification key and proofs are compatible with Ethereum smart contracts using the generated Solidity verifier:
- `trusted-setup/merkle_tree_verifier.sol`

