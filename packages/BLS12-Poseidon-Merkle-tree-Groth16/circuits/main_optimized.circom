pragma circom 2.0.0;

include "./poseidon_optimized_bls12381.circom";
include "./node_modules/circomlib/circuits/comparators.circom";

// StorageLeafComputation using optimized Poseidon4 BLS12-381
template StorageLeafComputationOptimized(max_leaves) {
    signal input channel_id;
    signal input active_leaves;
    signal input storage_keys[max_leaves];
    signal input storage_values[max_leaves];
    signal output leaf_values[max_leaves];
    
    // Poseidon4 hash for each leaf
    component poseidon4[max_leaves];
    
    for (var i = 0; i < max_leaves; i++) {
        poseidon4[i] = Poseidon4OptimizedBLS12381();
        poseidon4[i].in[0] <== storage_keys[i];
        poseidon4[i].in[1] <== storage_values[i];
        poseidon4[i].in[2] <== 0;
        poseidon4[i].in[3] <== 0;
        leaf_values[i] <== poseidon4[i].out;
    }
    
    // Bounds check - support up to 50 participants
    component lt = LessThan(8);
    lt.in[0] <== active_leaves;
    lt.in[1] <== 51; // max_leaves + 1, where max is 50
    lt.out === 1;
}

// Optimized Merkle Tree for 64 leaves (supports 50 participants)
template Poseidon4MerkleTreeOptimized() {
    signal input leaves[64];
    signal input leaf_count;
    signal output root;
    
    // Pre-declare all is_active components for 64 leaves
    component is_active[64];
    for (var i = 0; i < 64; i++) {
        is_active[i] = LessThan(8);
        is_active[i].in[0] <== i;
        is_active[i].in[1] <== leaf_count;
    }
    
    // Level 0: Hash leaves in groups of 4 (64 leaves → 16 intermediate nodes)
    component level0[16];
    signal level0_outputs[16];
    
    for (var i = 0; i < 16; i++) {
        level0[i] = Poseidon4OptimizedBLS12381();
        level0[i].in[0] <== is_active[i*4 + 0].out * leaves[i*4 + 0];
        level0[i].in[1] <== is_active[i*4 + 1].out * leaves[i*4 + 1];
        level0[i].in[2] <== is_active[i*4 + 2].out * leaves[i*4 + 2];
        level0[i].in[3] <== is_active[i*4 + 3].out * leaves[i*4 + 3];
        level0_outputs[i] <== level0[i].out;
    }
    
    // Level 1: Hash intermediate nodes in groups of 4 (16 → 4 nodes)
    component level1[4];
    signal level1_outputs[4];
    
    for (var i = 0; i < 4; i++) {
        level1[i] = Poseidon4OptimizedBLS12381();
        level1[i].in[0] <== level0_outputs[i*4 + 0];
        level1[i].in[1] <== level0_outputs[i*4 + 1];
        level1[i].in[2] <== level0_outputs[i*4 + 2];
        level1[i].in[3] <== level0_outputs[i*4 + 3];
        level1_outputs[i] <== level1[i].out;
    }
    
    // Level 2: Hash to get root (4 → 1 node)
    component level2 = Poseidon4OptimizedBLS12381();
    level2.in[0] <== level1_outputs[0];
    level2.in[1] <== level1_outputs[1];
    level2.in[2] <== level1_outputs[2];
    level2.in[3] <== level1_outputs[3];
    
    root <== level2.out;
}

// Main circuit with optimized implementation for 50 participants
template TokamakStorageMerkleProofOptimized() {
    signal input merkle_root;
    signal input active_leaves;
    signal input channel_id;
    signal input storage_keys[50];
    signal input storage_values[50];
    
    // Compute storage leaves for 50 participants
    component storage_leaves = StorageLeafComputationOptimized(50);
    storage_leaves.channel_id <== channel_id;
    storage_leaves.active_leaves <== active_leaves;
    
    for (var i = 0; i < 50; i++) {
        storage_leaves.storage_keys[i] <== storage_keys[i];
        storage_leaves.storage_values[i] <== storage_values[i];
    }
    
    // Pad to 64 leaves for the Merkle tree (50 actual + 14 padding)
    signal padded_leaves[64];
    
    for (var i = 0; i < 50; i++) {
        padded_leaves[i] <== storage_leaves.leaf_values[i];
    }
    
    // Pad remaining slots with zeros
    for (var i = 50; i < 64; i++) {
        padded_leaves[i] <== 0;
    }
    
    // Compute Merkle tree
    component merkle_tree = Poseidon4MerkleTreeOptimized();
    merkle_tree.leaf_count <== active_leaves;
    
    for (var i = 0; i < 64; i++) {
        merkle_tree.leaves[i] <== padded_leaves[i];
    }
    
    // Verify root constraint - ensure computed root matches expected root
    component root_check = IsEqual();
    root_check.in[0] <== merkle_root;
    root_check.in[1] <== merkle_tree.root;
    root_check.out === 1;
}

component main = TokamakStorageMerkleProofOptimized();