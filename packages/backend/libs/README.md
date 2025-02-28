# Library functions for Tokamak zk-SNARK

This library contains implementation of mathematical functions for [Tokamak zk-SNARK](https://eprint.iacr.org/2024/507). All functions are based on [Ingonyama's ICICLE APIs](https://github.com/ingonyama-zk/icicle) for bls12-381 curve.

The library composition is as follows:
- group_structures: Structures and functions for the setup, prove, and verify algorithms.
- polynomials: Functions for bivariate Polynomials, such as arithmetic operations, evaluations, and coset divisions.
- tools: Functions for file read and write.
- vectors: Functions for vector-matrix operations.
- benches: Functions for testing and optimization.
