pragma circom 2.1.6;
function nPubOut() {return 2;}
function nPubIn() {return 14;}
function nEVMIn() {return 200;}
function nPrvIn() {return 454;}

function nPoseidonInputs() {return 2;}
function nMtDepth() {return 4;}
function nMtLeaves() {return nPoseidonInputs() ** nMtDepth();}
function nAccumulation() {return 32;}
function nPrevBlockHashes() {return 8;}
function nJubjubExpBatch() {return 64;}
function nSubExpBatch() {return 16;}
