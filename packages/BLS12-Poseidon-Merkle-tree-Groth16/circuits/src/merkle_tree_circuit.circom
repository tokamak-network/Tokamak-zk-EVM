pragma circom 2.0.0;

include "../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";

// Poseidon4-based Merkle Tree (64 leaves → 1 root)
template Poseidon4MerkleTree() {
    signal input leaves[64];
    signal output root;

    // Level 0: 64 → 16
    component level0[16];
    signal level0_outputs[16];
    for (var i = 0; i < 16; i++) {
        level0[i] = Poseidon255(4);
        level0[i].in[0] <== leaves[i*4 + 0];
        level0[i].in[1] <== leaves[i*4 + 1];
        level0[i].in[2] <== leaves[i*4 + 2];
        level0[i].in[3] <== leaves[i*4 + 3];
        level0_outputs[i] <== level0[i].out;
    }

    // Level 1: 16 → 4
    component level1[4];
    signal level1_outputs[4];
    for (var i = 0; i < 4; i++) {
        level1[i] = Poseidon255(4);
        level1[i].in[0] <== level0_outputs[i*4 + 0];
        level1[i].in[1] <== level0_outputs[i*4 + 1];
        level1[i].in[2] <== level0_outputs[i*4 + 2];
        level1[i].in[3] <== level0_outputs[i*4 + 3];
        level1_outputs[i] <== level1[i].out;
    }

    // Level 2: 4 → 1 (Merkle root)
    component level2 = Poseidon255(4);
    level2.in[0] <== level1_outputs[0];
    level2.in[1] <== level1_outputs[1];
    level2.in[2] <== level1_outputs[2];
    level2.in[3] <== level1_outputs[3];

    root <== level2.out;
}

// Main circuit: Compute Merkle root from 50 (key, value) pairs
template TokamakStorageMerkleProof() {
    // Public inputs: on-chain guaranteed (MPT) data
    signal input merkle_keys[50];
    signal input storage_values[50];
    signal input merkle_root;       // Public input for verification

    // Internal computed root
    signal computed_root;

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

    // Verification constraint: claimed root must match computed root
    merkle_root === computed_root;
}

component main { public [merkle_keys, storage_values, merkle_root] } = TokamakStorageMerkleProof();