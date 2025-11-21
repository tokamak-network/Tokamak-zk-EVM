pragma circom 2.0.0;

include "../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";

// Parameterized Poseidon Merkle Tree based on tree depth N
// Tree capacity: 2^N leaves
template Poseidon2MerkleTree(N) {
    var nLeaves = 2 ** N;
    signal input leaves[nLeaves];
    signal output root;
    
    // Calculate total number of components needed across all levels
    var totalComponents = 0;
    var temp = nLeaves;
    for (var level = 0; level < N; level++) {
        temp = temp \ 2;
        totalComponents += temp;
    }
    
    component hashers[totalComponents];
    
    // Signals to store outputs for each level
    signal levelOutputs[N][nLeaves \ 2];
    
    var componentIndex = 0;
    var currentLevelSize = nLeaves;
    
    for (var level = 0; level < N; level++) {
        var nextLevelSize = currentLevelSize \ 2;
        
        for (var i = 0; i < nextLevelSize; i++) {
            hashers[componentIndex] = Poseidon255(2);
            
            if (level == 0) {
                // First level: use input leaves
                hashers[componentIndex].in[0] <== leaves[i*2 + 0];
                hashers[componentIndex].in[1] <== leaves[i*2 + 1];
            } else {
                // Subsequent levels: use previous level outputs
                hashers[componentIndex].in[0] <== levelOutputs[level-1][i*2 + 0];
                hashers[componentIndex].in[1] <== levelOutputs[level-1][i*2 + 1];
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
    var nLeaves = 2 ** N;
    
    // Public inputs - L2MPT storage keys and values
    signal input storage_keys_L2MPT[nLeaves];  // L2MPT storage keys (published onchain)
    signal input storage_values[nLeaves];      // Storage values
    
    // Public output - the computed Merkle root
    signal output merkle_root;
    
    // Step 1: Compute final leaves
    // leaf = poseidon2(storage_key_L2MPT, storage_value)
    component leaf_hash[nLeaves];
    signal leaf_values[nLeaves];
    
    for (var i = 0; i < nLeaves; i++) {
        leaf_hash[i] = Poseidon255(2);
        leaf_hash[i].in[0] <== storage_keys_L2MPT[i];   // L2MPT storage key (provided directly)
        leaf_hash[i].in[1] <== storage_values[i];       // Storage value
        leaf_values[i] <== leaf_hash[i].out;
    }
    
    // Step 2: Compute Merkle tree
    component merkle_tree = Poseidon2MerkleTree(N);
    
    for (var i = 0; i < nLeaves; i++) {
        merkle_tree.leaves[i] <== leaf_values[i];
    }
    
    // Output the computed root
    merkle_root <== merkle_tree.root;
}

// Example configurations:
// N=2: 2^2 = 4 leaves   (suitable for small channels)
// N=3: 2^3 = 8 leaves   (suitable for medium channels)  
// N=4: 2^4 = 16 leaves  (suitable for large channels)

// Change this line to configure for different tree depths:
component main{public [storage_keys_L2MPT, storage_values]} = TokamakStorageMerkleProof(4);

// Tree depth N=4 gives us 16 leaves, which can support:
// - 16 users with 1 storage slot each, OR
// - 8 users with 2 storage slots each, OR
// - 4 users with 4 storage slots each, OR
// - 2 users with 8 storage slots each, OR
// - 1 user with 16 storage slots