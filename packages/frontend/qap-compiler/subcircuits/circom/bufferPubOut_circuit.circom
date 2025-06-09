pragma circom 2.1.6;
include "../../templates/buffer.circom";

// Input wires are private, and output wires are public.
component main{public [in]} = Buffer(1);

