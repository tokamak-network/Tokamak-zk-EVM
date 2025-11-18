pragma circom 2.1.6;

include "../node_modules/poseidon-bls12381-circom/circuits/poseidon255_constants.circom";

// x ↦ x^5
function x5_f(x) {
    var in2 = x * x;
    var in4 = in2 * in2;
    return in4 * x;
}

// Poseidon255 permutation as a pure function over vars.
function _Poseidon255_2(inVals) {
    // For binary
    var nInputs = 2;
    // var N_P_ARRAY[16] = [
    //     56, 56, 56, 56,
    //     57, 57, 57, 57,
    //     57, 57, 57, 57,
    //     57, 57, 57, 57
    // ];

    // var t = nInputs + 1;
    // var N_P = N_P_ARRAY[nInputs - 1];
    var t = 3;
    var N_P = 56;
    var N_F = 8;

    var C[t * (N_P + N_F)] = CONSTANTS(t);
    var M[t][t] = MATRIX(t);

    var state[t];
    var nextState[t];

    for (var j = 0; j < t; j++) {
        if (j == 0) {
            state[0] = 0;
        } else {
            state[j] = inVals[j - 1];
        }
    }

    var totalRounds = N_P + N_F;
    var index;

    for (var i = 0; i < totalRounds; i++) {
        for (var j = 0; j < t; j++) {
            state[j] = state[j] + C[i * t + j];
        }

        if (i < N_F / 2 || i >= N_F / 2 + N_P) {
            for (var j = 0; j < t; j++) {
                state[j] = x5_f(state[j]);
            }
        } else {
            state[0] = x5_f(state[0]);
        }

        for (var r = 0; r < t; r++) {
            var acc = 0;
            for (var c = 0; c < t; c++) {
                acc = acc + state[c] * M[r][c];
            }
            nextState[r] = acc;
        }

        for (var k = 0; k < t; k++) {
            state[k] = nextState[k];
        }
    }
    return state[0];
}