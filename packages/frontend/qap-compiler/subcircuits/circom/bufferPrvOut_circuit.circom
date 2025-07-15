pragma circom 2.1.6;
include "../../templates/buffer.circom";

// Input and output wires are private.
component main{public [in]} = Buffer(60);
