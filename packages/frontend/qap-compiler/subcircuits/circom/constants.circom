pragma circom 2.1.6;
function nPubOut() {return 8;}
function nPubIn() {return 32;}
function nEVMIn() {return 500;}
function nPrvIn() {return 550;}

function nAccumulation() {return 32;}
function nPrevBlockHashes() {return 4;}
function nJubjubExpBatch() {return 64;}
function nSubExpBatch() {return 16;}

// Constants imported from TokamakL2JS (see scripts/compile.sh)
function nPoseidonInputs() {return 2;}
function nMtDepth() {return 4;}
function nMtLeaves() {return nPoseidonInputs() ** nMtDepth();}
