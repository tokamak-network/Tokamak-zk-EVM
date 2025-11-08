pragma circom 2.0.0;

include "../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";
include "merkle_tree_circuit.circom";

// Helper circuit that outputs the computed root without constraint
template MerkleRootComputer() {
    // Public inputs: on-chain guaranteed (MPT) data
    signal input merkle_keys[50];
    signal input storage_values[50];
    signal output computed_root;

    // Compute Poseidon4 hashes for each leaf: poseidon4(index, key, value, 0)
    component poseidon4[50];
    signal leaf_values[50];
    for (var i = 0; i < 50; i++) {
        poseidon4[i] = Poseidon255(4);
        poseidon4[i].in[0] <== i;
        poseidon4[i].in[1] <== merkle_keys[i];
        poseidon4[i].in[2] <== storage_values[i];
        poseidon4[i].in[3] <== 0;
        leaf_values[i] <== poseidon4[i].out;
    }

    // Pad to 64 leaves
    signal padded_leaves[64];
    for (var i = 0; i < 50; i++) {
        padded_leaves[i] <== leaf_values[i];
    }
    for (var i = 50; i < 64; i++) {
        padded_leaves[i] <== 0;
    }

    // Compute Merkle root
    component merkle_tree = Poseidon4MerkleTree();
    for (var i = 0; i < 64; i++) {
        merkle_tree.leaves[i] <== padded_leaves[i];
    }

    computed_root <== merkle_tree.root;
}

component main { public [merkle_keys, storage_values] } = MerkleRootComputer();