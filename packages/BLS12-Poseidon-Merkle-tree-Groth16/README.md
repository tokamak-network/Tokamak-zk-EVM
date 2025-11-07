# Tokamak Groth16 zkSNARK Production Implementation

This directory contains a production-ready Groth16 zero-knowledge SNARK implementation for Tokamak's storage proof verification system, supporting up to 50 participants.

## Architecture

The circuit implements a quaternary Merkle tree using Poseidon4 hashing over the BLS12-381 curve to prove storage state consistency across channel participants.

