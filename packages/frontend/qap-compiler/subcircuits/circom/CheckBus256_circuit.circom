pragma circom 2.1.6;
include "../../templates/256bit/compare_safe.circom";

// Constrains both limbs of a 256-bit word to their canonical 128-bit ranges.
template CheckBus256Circuit() {
    signal input in[2];

    CheckBus256()(in);
}

component main {public [in]} = CheckBus256Circuit();
