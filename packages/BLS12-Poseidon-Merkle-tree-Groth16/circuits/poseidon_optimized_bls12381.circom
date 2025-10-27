pragma circom 2.0.0;

include "./poseidon_bls12381_constants_complete.circom";

// Optimized Poseidon4 for BLS12-381 with circom 2.0
// Uses 32 rounds (160 constants) 

// S-box (x^5) optimized for circom 2.0
template SBox() {
    signal input in;
    signal output out;
    
    signal in2 <== in * in;
    signal in4 <== in2 * in2;
    out <== in4 * in;
}

// MDS matrix multiplication using authentic BLS12-381 constants
template MDSTransform() {
    signal input in[5];
    signal output out[5];
    
    var matrix[5][5] = PoseidonBLS12381MDS();
    
    out[0] <== matrix[0][0]*in[0] + matrix[0][1]*in[1] + matrix[0][2]*in[2] + matrix[0][3]*in[3] + matrix[0][4]*in[4];
    out[1] <== matrix[1][0]*in[0] + matrix[1][1]*in[1] + matrix[1][2]*in[2] + matrix[1][3]*in[3] + matrix[1][4]*in[4];
    out[2] <== matrix[2][0]*in[0] + matrix[2][1]*in[1] + matrix[2][2]*in[2] + matrix[2][3]*in[3] + matrix[2][4]*in[4];
    out[3] <== matrix[3][0]*in[0] + matrix[3][1]*in[1] + matrix[3][2]*in[2] + matrix[3][3]*in[3] + matrix[3][4]*in[4];
    out[4] <== matrix[4][0]*in[0] + matrix[4][1]*in[1] + matrix[4][2]*in[2] + matrix[4][3]*in[3] + matrix[4][4]*in[4];
}

// Single Poseidon round
template PoseidonRound(round, isPartial) {
    signal input in[5];
    signal output out[5];
    
    var constants[320] = PoseidonBLS12381Constants();
    
    // Add round constants
    signal after_constants[5];
    after_constants[0] <== in[0] + constants[round * 5 + 0];
    after_constants[1] <== in[1] + constants[round * 5 + 1];
    after_constants[2] <== in[2] + constants[round * 5 + 2];
    after_constants[3] <== in[3] + constants[round * 5 + 3];
    after_constants[4] <== in[4] + constants[round * 5 + 4];
    
    // Apply S-box
    signal after_sbox[5];
    if (isPartial == 1) {
        // Partial round: S-box only on first element
        component sbox = SBox();
        sbox.in <== after_constants[0];
        after_sbox[0] <== sbox.out;
        after_sbox[1] <== after_constants[1];
        after_sbox[2] <== after_constants[2];
        after_sbox[3] <== after_constants[3];
        after_sbox[4] <== after_constants[4];
    } else {
        // Full round: S-box on all elements
        component sbox[5];
        for (var i = 0; i < 5; i++) {
            sbox[i] = SBox();
            sbox[i].in <== after_constants[i];
            after_sbox[i] <== sbox[i].out;
        }
    }
    
    // Apply MDS matrix
    component mds = MDSTransform();
    mds.in[0] <== after_sbox[0];
    mds.in[1] <== after_sbox[1];
    mds.in[2] <== after_sbox[2];
    mds.in[3] <== after_sbox[3];
    mds.in[4] <== after_sbox[4];
    
    out[0] <== mds.out[0];
    out[1] <== mds.out[1];
    out[2] <== mds.out[2];
    out[3] <== mds.out[3];
    out[4] <== mds.out[4];
}

// Optimized Poseidon permutation: 4 full + 24 partial + 4 full = 32 rounds
template PoseidonOptimizedBLS12381() {
    signal input in[5];
    signal output out[5];
    
    var FULL_ROUNDS_HALF = 4;
    var PARTIAL_ROUNDS = 24;
    var TOTAL_ROUNDS = 32;
    
    signal state[TOTAL_ROUNDS + 1][5];
    
    // Initialize
    state[0][0] <== in[0];
    state[0][1] <== in[1];
    state[0][2] <== in[2];
    state[0][3] <== in[3];
    state[0][4] <== in[4];
    
    // First 4 full rounds
    component rounds[TOTAL_ROUNDS];
    for (var i = 0; i < FULL_ROUNDS_HALF; i++) {
        rounds[i] = PoseidonRound(i, 0); // Full round
        rounds[i].in[0] <== state[i][0];
        rounds[i].in[1] <== state[i][1];
        rounds[i].in[2] <== state[i][2];
        rounds[i].in[3] <== state[i][3];
        rounds[i].in[4] <== state[i][4];
        
        state[i + 1][0] <== rounds[i].out[0];
        state[i + 1][1] <== rounds[i].out[1];
        state[i + 1][2] <== rounds[i].out[2];
        state[i + 1][3] <== rounds[i].out[3];
        state[i + 1][4] <== rounds[i].out[4];
    }
    
    // 24 partial rounds
    for (var i = 0; i < PARTIAL_ROUNDS; i++) {
        var round_idx = FULL_ROUNDS_HALF + i;
        rounds[round_idx] = PoseidonRound(round_idx, 1); // Partial round
        rounds[round_idx].in[0] <== state[round_idx][0];
        rounds[round_idx].in[1] <== state[round_idx][1];
        rounds[round_idx].in[2] <== state[round_idx][2];
        rounds[round_idx].in[3] <== state[round_idx][3];
        rounds[round_idx].in[4] <== state[round_idx][4];
        
        state[round_idx + 1][0] <== rounds[round_idx].out[0];
        state[round_idx + 1][1] <== rounds[round_idx].out[1];
        state[round_idx + 1][2] <== rounds[round_idx].out[2];
        state[round_idx + 1][3] <== rounds[round_idx].out[3];
        state[round_idx + 1][4] <== rounds[round_idx].out[4];
    }
    
    // Final 4 full rounds
    for (var i = 0; i < FULL_ROUNDS_HALF; i++) {
        var round_idx = FULL_ROUNDS_HALF + PARTIAL_ROUNDS + i;
        rounds[round_idx] = PoseidonRound(round_idx, 0); // Full round
        rounds[round_idx].in[0] <== state[round_idx][0];
        rounds[round_idx].in[1] <== state[round_idx][1];
        rounds[round_idx].in[2] <== state[round_idx][2];
        rounds[round_idx].in[3] <== state[round_idx][3];
        rounds[round_idx].in[4] <== state[round_idx][4];
        
        state[round_idx + 1][0] <== rounds[round_idx].out[0];
        state[round_idx + 1][1] <== rounds[round_idx].out[1];
        state[round_idx + 1][2] <== rounds[round_idx].out[2];
        state[round_idx + 1][3] <== rounds[round_idx].out[3];
        state[round_idx + 1][4] <== rounds[round_idx].out[4];
    }
    
    // Output final state
    out[0] <== state[TOTAL_ROUNDS][0];
    out[1] <== state[TOTAL_ROUNDS][1];
    out[2] <== state[TOTAL_ROUNDS][2];
    out[3] <== state[TOTAL_ROUNDS][3];
    out[4] <== state[TOTAL_ROUNDS][4];
}

// Poseidon4 hash function
template Poseidon4OptimizedBLS12381() {
    signal input in[4];
    signal output out;
    
    component permutation = PoseidonOptimizedBLS12381();
    permutation.in[0] <== in[0];
    permutation.in[1] <== in[1];
    permutation.in[2] <== in[2];
    permutation.in[3] <== in[3];
    permutation.in[4] <== 0; // capacity
    
    out <== permutation.out[0];
}

// Backward compatibility
template SimplePoseidon(inputs) {
    signal input in[inputs];
    signal output out;
    
    assert(inputs == 4);
    
    component poseidon = Poseidon4OptimizedBLS12381();
    poseidon.in[0] <== in[0];
    poseidon.in[1] <== in[1];
    poseidon.in[2] <== in[2];
    poseidon.in[3] <== in[3];
    
    out <== poseidon.out;
}