pragma circom 2.1.6;
function nPubIn() {return 14;}
function nPubOut() {return 4;}
function nPrvIn() {return 550;}
function nEVMIn() {return 160;}
function nPoseidonInputs() {return 4;}
function nMtDepth() {return 3;}
function nMtLeaves() {return nPoseidonInputs() ** nMtDepth();}
function nAccumulation() {return 32;}
function nPrevBlockHashes() {return 8;}
function nJubjubExpBatch() {return 37;}
function nSubExpBatch() {return 8;}
