pragma circom 2.1.6;
function nPubIn() {return 10;}
function nPubOut() {return 6;}
function nPrvIn() {return 70;}
function nEVMIn() {return 170;}
function nPoseidonInputs() {return 4;}
function nMtDepth() {return 2;}
function nMtLeaves() {return nPoseidonInputs() ** nMtDepth();}
function nAccumulation() {return 32;}
function nPrevBlockHashes() {return 8;}
function nJubjubExpBatch() {return 37;}
