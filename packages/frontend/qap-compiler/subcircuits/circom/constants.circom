pragma circom 2.1.6;
function nPubOut() {return 10;}
function nPubIn() {return 20;}
function nEVMIn() {return 1300;}
function nPrvIn() {return 1000;}

function nPoseidonInputs() {return 2;}
function nMtDepth() {return 10;}
function nMtLeaves() {return nPoseidonInputs() ** nMtDepth();}
function nAccumulation() {return 32;}
function nPrevBlockHashes() {return 4;}
function nJubjubExpBatch() {return 128;}
function nSubExpBatch() {return 32;}
