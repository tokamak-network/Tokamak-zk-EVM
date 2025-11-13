# Tokamak ZK Proof Generator

This directory contains the proof generation script for the Tokamak Storage Merkle Proof circuit.

## Files

- `generateProof.js` - Main proof generation script
- `input.json` - Circuit input data (modify as needed)
- `input_example.json` - Example input data
- `proof.json` - Generated proof (output)
- `public.json` - Public signals (output)

## Prerequisites

- Node.js installed
- snarkjs installed globally: `npm install -g snarkjs`
- Compiled circuit files in `../circuit_js/`
- Trusted setup files in `../trusted-setup/`

## Usage

1. Navigate to the prover directory:
   ```bash
   cd prover
   ```

2. Ensure your input data is in `input.json` (or copy from `input_example.json`)

3. Run the proof generation script:
   ```bash
   node generateProof.js
   ```

## What the script does

1. **Generates witness**: Uses `snarkjs wtns calculate` to create witness from input
2. **Generates proof**: Uses `snarkjs groth16 prove` to create ZK proof
3. **Validates output**: Checks that proof and public signal files are created
4. **Provides summary**: Shows proof details and file locations

## Circuit Details

- **Circuit**: Tokamak Storage Merkle Proof (depth N=4)
- **Leaves**: 256 leaves (4^4)
- **Protocol**: Groth16
- **Curve**: BLS12-381
- **Hash function**: Poseidon

## Input Format

The input JSON should contain:
- `L2PublicKeys_x`: Array of 256 x-coordinates
- `L2PublicKeys_y`: Array of 256 y-coordinates  
- `storage_slots`: Array of 256 storage slot values
- `storage_values`: Array of 256 storage values

## Output Files

- `proof.json`: Contains the ZK proof (pi_a, pi_b, pi_c)
- `public.json`: Contains public signals (merkle_root)
- `witness.wtns`: Witness file (intermediate)