pragma circom 2.1.6;
function nPubOut() {return 10;}
function nPubIn() {return 20;}
function nEVMIn() {return 370;}
function nPrvIn() {return 550;}

function nPoseidonInputs() {return 2;}
function nMtDepth() {return 10;}
function nMtLeaves() {return nPoseidonInputs() ** nMtDepth();}
function nAccumulation() {return 32;}
function nPrevBlockHashes() {return 4;}
function nJubjubExpBatch() {return 64;}
function nSubExpBatch() {return 16;}
