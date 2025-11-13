pragma circom 2.1.6;
function nPubIn() {return 10;}
function nPubOut() {return 10;}  // Increased for L2 state channel (minimum 6, set to 10 for safety)
function nPrvIn() {return 70;}
function nEVMIn() {return 170;}
function nPoseidonInputs() {return 4;}
function nMtDepth() {return 2;}
function nMtLeaves() {return nPoseidonInputs() ** nMtDepth();}
function nAccumulation() {return 32;}
function nPrevBlockHashes() {return 8;}
