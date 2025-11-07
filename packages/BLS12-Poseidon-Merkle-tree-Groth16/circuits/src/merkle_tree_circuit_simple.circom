pragma circom 2.0.0;

include "../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// Merkle Tree for up to 64 leaves using Poseidon4 hash function
template Poseidon4MerkleTree(max_leaves) {
    signal input leaves[max_leaves];
    signal output root;
    
    // Level 0: Hash leaves in groups of 4 (64 leaves → 16 intermediate nodes)
    var level0_nodes = max_leaves / 4;
    component level0[level0_nodes];
    signal level0_outputs[level0_nodes];
    
    for (var i = 0; i < level0_nodes; i++) {
        level0[i] = Poseidon255(4);
        level0[i].in[0] <== leaves[i*4 + 0];
        level0[i].in[1] <== leaves[i*4 + 1];
        level0[i].in[2] <== leaves[i*4 + 2];
        level0[i].in[3] <== leaves[i*4 + 3];
        level0_outputs[i] <== level0[i].out;
    }
    
    // Level 1: Hash intermediate nodes in groups of 4 (16 → 4 nodes)
    var level1_nodes = level0_nodes / 4;
    component level1[level1_nodes];
    signal level1_outputs[level1_nodes];
    
    for (var i = 0; i < level1_nodes; i++) {
        level1[i] = Poseidon255(4);
        level1[i].in[0] <== level0_outputs[i*4 + 0];
        level1[i].in[1] <== level0_outputs[i*4 + 1];
        level1[i].in[2] <== level0_outputs[i*4 + 2];
        level1[i].in[3] <== level0_outputs[i*4 + 3];
        level1_outputs[i] <== level1[i].out;
    }
    
    // Level 2: Hash to get root (4 → 1 node)
    component level2 = Poseidon255(4);
    level2.in[0] <== level1_outputs[0];
    level2.in[1] <== level1_outputs[1];
    level2.in[2] <== level1_outputs[2];
    level2.in[3] <== level1_outputs[3];
    
    root <== level2.out;
}

// Main circuit: Verify that claimed merkle_root is computed from given leaves
template TokamakStorageMerkleProof() {
    // Public inputs - verifiers provide these to validate the claimed root
    signal input leaves[64];           // The integrity-guaranteed leaves
    signal input merkle_root;          // The claimed Merkle root by channel leader
    
    // Compute Merkle tree root from the provided leaves
    component merkle_tree = Poseidon4MerkleTree(64);
    
    for (var i = 0; i < 64; i++) {
        merkle_tree.leaves[i] <== leaves[i];
    }
    
    // Constraint: computed root must equal claimed root
    component root_check = IsEqual();
    root_check.in[0] <== merkle_root;
    root_check.in[1] <== merkle_tree.root;
    root_check.out === 1;
}

component main{public [leaves, merkle_root]} = TokamakStorageMerkleProof();