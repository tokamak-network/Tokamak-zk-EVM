"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NODE_WIDTH = exports.LeafVerkleNodeValue = exports.VerkleNodeType = void 0;
var VerkleNodeType;
(function (VerkleNodeType) {
    VerkleNodeType[VerkleNodeType["Internal"] = 0] = "Internal";
    VerkleNodeType[VerkleNodeType["Leaf"] = 1] = "Leaf";
})(VerkleNodeType = exports.VerkleNodeType || (exports.VerkleNodeType = {}));
var LeafVerkleNodeValue;
(function (LeafVerkleNodeValue) {
    LeafVerkleNodeValue[LeafVerkleNodeValue["Untouched"] = 0] = "Untouched";
    LeafVerkleNodeValue[LeafVerkleNodeValue["Deleted"] = 1] = "Deleted";
})(LeafVerkleNodeValue = exports.LeafVerkleNodeValue || (exports.LeafVerkleNodeValue = {}));
exports.NODE_WIDTH = 256;
//# sourceMappingURL=types.js.map