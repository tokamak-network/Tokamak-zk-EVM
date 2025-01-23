"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETURN_PLACEMENT = exports.KECCAK_OUT_PLACEMENT = exports.KECCAK_IN_PLACEMENT = exports.LOAD_PLACEMENT = exports.DEFAULT_SOURCE_SIZE = exports.INITIAL_PLACEMENT_INDEX = exports.KECCAK_OUT_PLACEMENT_INDEX = exports.KECCAK_IN_PLACEMENT_INDEX = exports.RETURN_PLACEMENT_INDEX = exports.LOAD_PLACEMENT_INDEX = void 0;
exports.LOAD_PLACEMENT_INDEX = 0;
exports.RETURN_PLACEMENT_INDEX = 1;
exports.KECCAK_IN_PLACEMENT_INDEX = 2;
exports.KECCAK_OUT_PLACEMENT_INDEX = 3;
exports.INITIAL_PLACEMENT_INDEX = exports.KECCAK_OUT_PLACEMENT_INDEX + 1;
exports.DEFAULT_SOURCE_SIZE = 32;
exports.LOAD_PLACEMENT = {
    name: 'InterfaceBufferIn',
    inPts: [],
    outPts: [],
};
exports.KECCAK_IN_PLACEMENT = {
    name: 'KeccakBufferIn',
    inPts: [],
    outPts: [],
};
exports.KECCAK_OUT_PLACEMENT = {
    name: 'KeccakBufferOut',
    inPts: [],
    outPts: [],
};
exports.RETURN_PLACEMENT = {
    name: 'InterfaceBufferOut',
    inPts: [],
    outPts: [],
};
//# sourceMappingURL=placement.js.map