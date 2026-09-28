pragma circom 2.1.6;
include "../../templates/buffer.circom";
include "./constants.circom";

// This standalone wrapper exposes `in` so Circom emits its input port.
// The final QAP boundary is defined by scripts/configure.js.
component main{public [in]} = Buffer2(nLogOut());
