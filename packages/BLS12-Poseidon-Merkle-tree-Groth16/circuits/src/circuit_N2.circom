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
    
    // Public inputs - L2MPT storage keys and values
    signal input storage_keys_L2MPT[nLeaves];  // L2MPT storage keys (published onchain)
    signal input storage_values[nLeaves];      // Storage values
    
    // Public output - the computed Merkle root
    signal output merkle_root;
    
    // Step 1: Compute final leaves
    // leaf = poseidon4(index, storage_key_L2MPT, storage_value, 0)
    component leaf_hash[nLeaves];
    signal leaf_values[nLeaves];
    
    for (var i = 0; i < nLeaves; i++) {
        leaf_hash[i] = Poseidon255(4);
        leaf_hash[i].in[0] <== i;                       // Leaf index
        leaf_hash[i].in[1] <== storage_keys_L2MPT[i];   // L2MPT storage key (provided directly)
        leaf_hash[i].in[2] <== storage_values[i];       // Storage value
        leaf_hash[i].in[3] <== 0;                       // Zero pad
        leaf_values[i] <== leaf_hash[i].out;
    }
    
    // Step 2: Compute Merkle tree
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
component main{public [storage_keys_L2MPT, storage_values]} = TokamakStorageMerkleProof(2);

// Tree depth N=2 gives us 16 leaves, which can support:
// - 16 users with 1 storage slots each, OR
// - 8 users with 2 storage slots each, OR
// - 5 users with 3 storage slots each OR
// - 4 users with 4 storage slots each OR
// - 3 users with 5 storage slots each