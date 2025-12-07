# Library functions for Tokamak zk-SNARK

This library contains implementation of mathematical functions for [Tokamak zk-SNARK](https://eprint.iacr.org/2024/507). All functions are based on [Ingonyama's ICICLE APIs](https://github.com/ingonyama-zk/icicle) for bls12-381 curve.

The library composition is as follows:
- group_structures: Useful structures and functions defined over the elliptic curve group.
- field_structures: Useful structures and functions defined over the scalar field of the elliptic curve group.
- bivariate_polynomial: Functions for bivariate Polynomials, such as arithmetic operations, evaluations, and coset divisions.
- polynomial_structures Useful structures and functions defined over the ring of bivariate polynomials. 
- iotools: Functions for file read and write.
- vector_operations: Vector-matrix operations based on parallel computing.
