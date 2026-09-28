pragma circom 2.1.6;

include "../../../templates/255bit/transaction_signature.circom";
include "../../circom/constants.circom";

template TransactionSignatureProductionComposition(N) {
    signal input privateIn[N + 5];
    signal input contractAddress;
    signal input functionSelector;
    signal input S;
    signal input O[2];
    signal output evmContractAddress[2];
    signal output evmFunctionSelector[2];
    signal output origin[2];

    signal challengeInputs[N + 7];
    for (var index = 0; index < 5; index++) {
        challengeInputs[index] <== privateIn[index];
    }
    challengeInputs[5] <== contractAddress;
    challengeInputs[6] <== functionSelector;
    for (var index = 0; index < N; index++) {
        challengeInputs[7 + index] <== privateIn[5 + index];
    }

    var tailLength = (N + 2) % 4;
    if (tailLength == 0) tailLength = 4;
    var numberOfFullChainBatches = (N + 6 - tailLength) \ 4;
    component challengeBatches[numberOfFullChainBatches];
    for (var batch = 0; batch < numberOfFullChainBatches; batch++) {
        challengeBatches[batch] = TransactionSignaturePoseidonBatch4();
        challengeBatches[batch].in[0] <== 1;
        challengeBatches[batch].in[1] <== batch == 0 ? challengeInputs[0] : challengeBatches[batch - 1].out[1];
        challengeBatches[batch].in[2] <== challengeInputs[4 * batch + 1];
        challengeBatches[batch].in[3] <== 0;
        challengeBatches[batch].in[4] <== challengeInputs[4 * batch + 2];
        challengeBatches[batch].in[5] <== challengeInputs[4 * batch + 3];
        challengeBatches[batch].in[6] <== challengeInputs[4 * batch + 4];
    }

    var tailStart = 4 * numberOfFullChainBatches + 1;
    signal publicKeyHash;
    signal challengeHash;
    if (tailLength == 1) {
        component tail1 = TransactionSignaturePoseidonTail1();
        tail1.in <== [challengeInputs[2], challengeInputs[3], challengeBatches[numberOfFullChainBatches - 1].out[1], challengeInputs[tailStart]];
        publicKeyHash <== tail1.out[0];
        challengeHash <== tail1.out[1];
    } else if (tailLength == 2) {
        component tail2 = TransactionSignaturePoseidonTail2();
        tail2.in <== [challengeInputs[2], challengeInputs[3], challengeBatches[numberOfFullChainBatches - 1].out[1], challengeInputs[tailStart], challengeInputs[tailStart + 1]];
        publicKeyHash <== tail2.out[0];
        challengeHash <== tail2.out[1];
    } else if (tailLength == 3) {
        component tail3 = TransactionSignaturePoseidonBatch4();
        tail3.in <== [0, challengeInputs[2], challengeInputs[3], challengeBatches[numberOfFullChainBatches - 1].out[1], challengeInputs[tailStart], challengeInputs[tailStart + 1], challengeInputs[tailStart + 2]];
        publicKeyHash <== tail3.out[0];
        challengeHash <== tail3.out[1];
    } else {
        component tail4 = TransactionSignaturePoseidonBatch4();
        tail4.in <== [1, challengeBatches[numberOfFullChainBatches - 1].out[1], challengeInputs[tailStart], 0, challengeInputs[tailStart + 1], challengeInputs[tailStart + 2], challengeInputs[tailStart + 3]];
        challengeHash <== tail4.out[1];
    }

    signal pointPolicyOut[16];
    if (tailLength == 4) {
        component pointPolicyWithHash = TransactionSignaturePointPolicyWithHash();
        for (var coordinate = 0; coordinate < 4; coordinate++) pointPolicyWithHash.in[coordinate] <== challengeInputs[coordinate];
        pointPolicyWithHash.in[4] <== contractAddress;
        pointPolicyWithHash.in[5] <== functionSelector;
        pointPolicyWithHash.in[6] <== O[0];
        pointPolicyWithHash.in[7] <== O[1];
        for (var outputIndex = 0; outputIndex < 16; outputIndex++) pointPolicyOut[outputIndex] <== pointPolicyWithHash.out[outputIndex];
        publicKeyHash <== pointPolicyWithHash.out[16];
    } else {
        component pointPolicyWithoutHash = TransactionSignaturePointPolicy();
        for (var coordinate = 0; coordinate < 4; coordinate++) pointPolicyWithoutHash.in[coordinate] <== challengeInputs[coordinate];
        pointPolicyWithoutHash.in[4] <== contractAddress;
        pointPolicyWithoutHash.in[5] <== functionSelector;
        pointPolicyWithoutHash.in[6] <== O[0];
        pointPolicyWithoutHash.in[7] <== O[1];
        for (var outputIndex = 0; outputIndex < 16; outputIndex++) pointPolicyOut[outputIndex] <== pointPolicyWithoutHash.out[outputIndex];
    }
    evmContractAddress <== [pointPolicyOut[2], pointPolicyOut[3]];
    evmFunctionSelector <== [pointPolicyOut[0], pointPolicyOut[1]];

    component fixedPrefix = TransactionSignatureFixedPrefix70();
    fixedPrefix.in[0] <== S;
    component challengeChunks = TransactionSignatureChallengeChunks();
    challengeChunks.in[0] <== challengeHash;
    component variableFirstBatch = TransactionSignatureVariableFirstBatch32();
    variableFirstBatch.in[0] <== challengeChunks.out[0];
    for (var coordinate = 0; coordinate < 8; coordinate++) variableFirstBatch.in[1 + coordinate] <== pointPolicyOut[4 + coordinate];

    component variableBatches[3];
    for (var batch = 0; batch < 3; batch++) {
        variableBatches[batch] = TransactionSignatureVariableBatch32();
        variableBatches[batch].in[0] <== challengeChunks.out[1 + batch];
        for (var coordinate = 0; coordinate < 8; coordinate++) variableBatches[batch].in[1 + coordinate] <== pointPolicyOut[4 + coordinate];
        for (var coordinate = 0; coordinate < 4; coordinate++) {
            variableBatches[batch].in[9 + coordinate] <== batch == 0
                ? variableFirstBatch.out[coordinate]
                : variableBatches[batch - 1].out[coordinate];
        }
    }

    component final = TransactionSignatureFinal();
    final.in[0] <== fixedPrefix.out[0];
    for (var coordinate = 0; coordinate < 4; coordinate++) final.in[1 + coordinate] <== fixedPrefix.out[1 + coordinate];
    for (var coordinate = 0; coordinate < 4; coordinate++) final.in[5 + coordinate] <== variableBatches[2].out[coordinate];
    for (var coordinate = 0; coordinate < 4; coordinate++) final.in[9 + coordinate] <== pointPolicyOut[12 + coordinate];
    final.in[13] <== publicKeyHash;
    origin <== final.out;
}

component main {public [contractAddress, functionSelector, S, O]} =
    TransactionSignatureProductionComposition(nPrivateMessageInputs());
