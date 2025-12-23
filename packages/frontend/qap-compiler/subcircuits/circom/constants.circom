pragma circom 2.1.6;
function nPubOut() {return 8;}
function nPubIn() {return 32;}
function nEVMIn() {return 250;}
function nPrvIn() {return 450;}

function nPoseidonInputs() {return 2;}
function nMtDepth() {return 4;}
function nMtLeaves() {return nPoseidonInputs() ** nMtDepth();}
function nAccumulation() {return 32;}
function nPrevBlockHashes() {return 4;}
function nJubjubExpBatch() {return 64;}
function nSubExpBatch() {return 16;}
