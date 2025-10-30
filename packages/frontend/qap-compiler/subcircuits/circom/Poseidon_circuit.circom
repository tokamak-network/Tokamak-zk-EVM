pragma circom 2.1.6;
include "../../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";
include "../../scripts/constants.circom";

component main = Poseidon255(nPoseidonInputs());