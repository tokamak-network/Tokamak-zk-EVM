pragma circom 2.1.6;

template StorageAccess() {
    // currentAddress[2], currentKey[2], canonicalAddress[2], canonicalKey[2]
    signal input in[8];

    for (var i = 0; i < 2; i++) {
        (in[i] - in[4 + i]) * (in[i] - in[4 + i]) === 0;
        (in[i] + in[4 + i]) * (in[i] - in[4 + i]) === in[i] - in[4 + i];
    }

    for (var i = 0; i < 2; i++) {
        (in[2 + i] - in[6 + i]) * (in[2 + i] - in[6 + i]) === 0;
        (in[2 + i] + in[6 + i]) * (in[2 + i] - in[6 + i]) === in[2 + i] - in[6 + i];
    }
}

// Preserve the input interface during standalone Circom compilation.
// The qap-compiler remaps it to free wires when composing this subcircuit.
component main {public [in]} = StorageAccess();
