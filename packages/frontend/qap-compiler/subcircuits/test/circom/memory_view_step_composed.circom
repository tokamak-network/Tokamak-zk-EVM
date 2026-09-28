pragma circom 2.1.6;

include "../../../templates/256bit/memory_view.circom";

template MemoryViewStepComposed() {
    // Two source limbs, encoded shift, and ownership for each step.
    signal input in[8];
    signal output out[3];

    component first = MemoryViewStep();
    first.in[0] <== in[0];
    first.in[1] <== in[1];
    first.in[2] <== in[2];
    first.in[3] <== in[3];
    first.in[4] <== 0;
    first.in[5] <== 0;
    first.in[6] <== 0;

    component second = MemoryViewStep();
    second.in[0] <== in[4];
    second.in[1] <== in[5];
    second.in[2] <== in[6];
    second.in[3] <== in[7];
    second.in[4] <== first.out[0];
    second.in[5] <== first.out[1];
    second.in[6] <== first.out[2];

    out <== second.out;
}

component main {public [in]} = MemoryViewStepComposed();
