pragma circom 2.1.6;
function nPubIn() {return 20;}
function nPubOut() {return 40;}
function nPrvIn() {return 40;}
function nEVMIn() {return 40;}
function nPoseidonInputs() {return 4;}
function nMtDepth() {return 4;}
function nMtLeaves() {return nMtDepth() ** 4;}
function nAccumulation() {return 32;}
function nPrevBlockHashes() {return 16;}
