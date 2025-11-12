pragma circom 2.0.0;

include "../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";

// Parameterized Poseidon Merkle Tree based on tree depth N
// Tree capacity: 4^N leaves
template Poseidon4MerkleTree(N) {
    var nLeaves = 4 ** N;
    signal input leaves[nLeaves];
    signal output root;
    
    // Calculate total number of components needed across all levels
    var totalComponents = 0;
    var temp = nLeaves;
    for (var level = 0; level < N; level++) {
        temp = temp \ 4;
        totalComponents += temp;
    }
    
    component hashers[totalComponents];
    
    // Signals to store outputs for each level
    signal levelOutputs[N][nLeaves \ 4];
    
    var componentIndex = 0;
    var currentLevelSize = nLeaves;
    
    for (var level = 0; level < N; level++) {
        var nextLevelSize = currentLevelSize \ 4;
        
        for (var i = 0; i < nextLevelSize; i++) {
            hashers[componentIndex] = Poseidon255(4);
            
            if (level == 0) {
                // First level: use input leaves
                hashers[componentIndex].in[0] <== leaves[i*4 + 0];
                hashers[componentIndex].in[1] <== leaves[i*4 + 1];
                hashers[componentIndex].in[2] <== leaves[i*4 + 2];
                hashers[componentIndex].in[3] <== leaves[i*4 + 3];
            } else {
                // Subsequent levels: use previous level outputs
                hashers[componentIndex].in[0] <== levelOutputs[level-1][i*4 + 0];
                hashers[componentIndex].in[1] <== levelOutputs[level-1][i*4 + 1];
                hashers[componentIndex].in[2] <== levelOutputs[level-1][i*4 + 2];
                hashers[componentIndex].in[3] <== levelOutputs[level-1][i*4 + 3];
            }
            
            levelOutputs[level][i] <== hashers[componentIndex].out;
            componentIndex++;
        }
        
        currentLevelSize = nextLevelSize;
    }
    
    // Root is the single output from the last level
    root <== levelOutputs[N-1][0];
}

// Parameterized Tokamak Storage Merkle Proof based on tree depth N
template TokamakStorageMerkleProof(N) {
    var nLeaves = 4 ** N;
    
    // Public inputs - L2 coordinate pairs, storage slots, and values
    signal input L2PublicKeys_x[nLeaves];      // X coordinates of L2 public keys
    signal input L2PublicKeys_y[nLeaves];      // Y coordinates of L2 public keys
    signal input storage_slots[nLeaves];       // Storage slot for each leaf
    signal input storage_values[nLeaves];      // Storage values
    
    // Public output - the computed Merkle root
    signal output merkle_root;
    
    // Step 1: Compute merkle_keys for each leaf
    // merkle_key = poseidon4(L2PublicKey_x, L2PublicKey_y, storage_slot, 0)
    component merkle_key_hash[nLeaves];
    signal computed_merkle_keys[nLeaves];
    
    for (var i = 0; i < nLeaves; i++) {
        merkle_key_hash[i] = Poseidon255(4);
        merkle_key_hash[i].in[0] <== L2PublicKeys_x[i];
        merkle_key_hash[i].in[1] <== L2PublicKeys_y[i];
        merkle_key_hash[i].in[2] <== storage_slots[i];
        merkle_key_hash[i].in[3] <== 0;  // Zero pad
        computed_merkle_keys[i] <== merkle_key_hash[i].out;
    }
    
    // Step 2: Compute final leaves
    // leaf = poseidon4(index, computed_merkle_key, storage_value, 0)
    component leaf_hash[nLeaves];
    signal leaf_values[nLeaves];
    
    for (var i = 0; i < nLeaves; i++) {
        leaf_hash[i] = Poseidon255(4);
        leaf_hash[i].in[0] <== i;                         // Leaf index
        leaf_hash[i].in[1] <== computed_merkle_keys[i];   // Computed MPT key
        leaf_hash[i].in[2] <== storage_values[i];         // Storage value
        leaf_hash[i].in[3] <== 0;                         // Zero pad
        leaf_values[i] <== leaf_hash[i].out;
    }
    
    // Step 3: Compute Merkle tree
    component merkle_tree = Poseidon4MerkleTree(N);
    
    for (var i = 0; i < nLeaves; i++) {
        merkle_tree.leaves[i] <== leaf_values[i];
    }
    
    // Output the computed root
    merkle_root <== merkle_tree.root;
}

// Example configurations:
// N=2: 4^2 = 16 leaves  (suitable for small channels)
// N=3: 4^3 = 64 leaves  (suitable for medium channels)  
// N=4: 4^4 = 256 leaves (suitable for large channels)

// Change this line to configure for different tree depths:
component main{public [L2PublicKeys_x, L2PublicKeys_y, storage_slots, storage_values]} = TokamakStorageMerkleProof(4);

// Tree depth N=4 gives us 256 leaves, which can support:
// - 256 users with 1 storage slot each, OR
// - 128 users with 2 storage slots each, OR  
// - 85 users with 3 storage slots each, OR
// - 64 users with 4 storage slots each, OR
// - 51 users with 5 storage slots each, OR
// - 42 users with 6 storage slots each OR
// - 36 users with 7 storage slots each OR
// - 32 users with 8 storage slots each etc...