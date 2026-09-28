pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type1.circom";

template MUL() {
    signal input in[4];
    signal output out[2];

    component inputBits[4];
    signal words[2][4];
    for (var operand = 0; operand < 2; operand++) {
        for (var limb = 0; limb < 2; limb++) {
            var inputIndex = 2 * operand + limb;
            inputBits[inputIndex] = Num2Bits(128);
            inputBits[inputIndex].in <== in[inputIndex];

            var lowWord = 0;
            var highWord = 0;
            for (var bit = 0; bit < 64; bit++) {
                lowWord += inputBits[inputIndex].out[bit] * (1 << bit);
                highWord += inputBits[inputIndex].out[bit + 64] * (1 << bit);
            }
            words[operand][2 * limb] <== lowWord;
            words[operand][2 * limb + 1] <== highWord;
        }
    }

    out <== Mul256TruncatedFrom64_unsafe()(words[0], words[1]);
    CheckBus256()(out);
}

component main {public [in]} = MUL();
