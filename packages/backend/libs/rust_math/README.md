# ZKP rust tool 

This repo contains implement ZKP rust tool for tokamak zk rollup. 

Here is the following functionlities of this repo 
* Bivariate Polynomial: implementation of Bivariate Polynomial, with evaluation and also ruffini division functionality. 
* Bivariate NTT: implementation of simple and coset FFT/IFFT. there is room for improvment like parallelizing the fft. 
* Lagrange Basis: Lagrange basis SRS implementation, it needs calculate IFFT on curve point which is implemented in CPU. it improve the prover time calculation by calculating Lagrange Basis once for all provers and do not calculate IFFT on last step of calculation and evaluate commitment from evaluations instead of using coefficients. 
* Bivariate KZG
* Batch Groth16: It batches R1CS together which the help of lagrange basis. it is implemented for BLS 12 381 curve F<sub>r</sub> Field 


