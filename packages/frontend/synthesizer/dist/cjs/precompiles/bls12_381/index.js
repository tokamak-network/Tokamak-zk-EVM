"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NobleBLS = exports.MCLBLS = void 0;
__exportStar(require("./constants.js"), exports);
var mcl_js_1 = require("./mcl.js");
Object.defineProperty(exports, "MCLBLS", { enumerable: true, get: function () { return mcl_js_1.MCLBLS; } });
var noble_js_1 = require("./noble.js");
Object.defineProperty(exports, "NobleBLS", { enumerable: true, get: function () { return noble_js_1.NobleBLS; } });
__exportStar(require("./util.js"), exports);
//# sourceMappingURL=index.js.map