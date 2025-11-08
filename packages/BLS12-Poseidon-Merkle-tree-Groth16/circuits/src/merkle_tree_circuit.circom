pragma circom 2.0.0;

include "../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";

// Simplified Merkle Tree for 64 leaves (supports 50 participants)
template Poseidon4MerkleTree() {
    signal input leaves[64];
    signal output root;
    
    // Level 0: Hash leaves in groups of 4 (64 leaves → 16 intermediate nodes)
    component level0[16];
    signal level0_outputs[16];
    
    for (var i = 0; i < 16; i++) {
        level0[i] = Poseidon255(4);  // 4-input Poseidon hash
        level0[i].in[0] <== leaves[i*4 + 0];
        level0[i].in[1] <== leaves[i*4 + 1];
        level0[i].in[2] <== leaves[i*4 + 2];
        level0[i].in[3] <== leaves[i*4 + 3];
        level0_outputs[i] <== level0[i].out;
    }
    
    // Level 1: Hash intermediate nodes in groups of 4 (16 → 4 nodes)
    component level1[4];
    signal level1_outputs[4];
    
    for (var i = 0; i < 4; i++) {
        level1[i] = Poseidon255(4);  // 4-input Poseidon hash
        level1[i].in[0] <== level0_outputs[i*4 + 0];
        level1[i].in[1] <== level0_outputs[i*4 + 1];
        level1[i].in[2] <== level0_outputs[i*4 + 2];
        level1[i].in[3] <== level0_outputs[i*4 + 3];
        level1_outputs[i] <== level1[i].out;
    }
    
    // Level 2: Hash to get root (4 → 1 node)
    component level2 = Poseidon255(4);  // 4-input Poseidon hash
    level2.in[0] <== level1_outputs[0];
    level2.in[1] <== level1_outputs[1];
    level2.in[2] <== level1_outputs[2];
    level2.in[3] <== level1_outputs[3];
    
    root <== level2.out;
}

// Main circuit for Tokamak Storage Merkle Proof
template TokamakStorageMerkleProof() {
    // Public inputs - MPT keys and values are integrity-guaranteed from onchain blocks
    signal input merkle_keys[50];       // L2 Merkle patricia trie keys
    signal input storage_values[50];    // Storage values (255 bit max)
    
    // Public output - the computed Merkle root
    signal output merkle_root;
    
    // Compute leaves using poseidon4(index, merkle_key, value, zero_pad) format
    component poseidon4[50];
    signal leaf_values[50];
    
    for (var i = 0; i < 50; i++) {
        poseidon4[i] = Poseidon255(4);  // 4-input Poseidon hash
        poseidon4[i].in[0] <== i;                    // Leaf index (implicit from array position)
        poseidon4[i].in[1] <== merkle_keys[i];       // L2 Merkle patricia trie key
        poseidon4[i].in[2] <== storage_values[i];    // Value (255 bit)
        poseidon4[i].in[3] <== 0;                    // 32-byte zero pad
        leaf_values[i] <== poseidon4[i].out;
    }
    
    // Pad to 64 leaves for the Merkle tree (50 actual + 14 padding)
    signal padded_leaves[64];
    
    for (var i = 0; i < 50; i++) {
        padded_leaves[i] <== leaf_values[i];
    }
    
    // Pad remaining slots with zeros
    for (var i = 50; i < 64; i++) {
        padded_leaves[i] <== 0;
    }
    
    // Compute Merkle tree
    component merkle_tree = Poseidon4MerkleTree();
    
    for (var i = 0; i < 64; i++) {
        merkle_tree.leaves[i] <== padded_leaves[i];
    }
    
    // Output the computed root
    merkle_root <== merkle_tree.root;
}

component main{public [merkle_keys, storage_values]} = TokamakStorageMerkleProof();