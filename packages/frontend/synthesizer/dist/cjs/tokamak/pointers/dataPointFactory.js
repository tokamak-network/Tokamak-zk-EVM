"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataPointFactory = void 0;
const index_js_1 = require("../validation/index.js");
class DataPointFactory {
    static create(params) {
        index_js_1.SynthesizerValidator.validateValue(params.value);
        return {
            ...params,
            valueHex: params.value.toString(16),
        };
    }
}
exports.DataPointFactory = DataPointFactory;
//# sourceMappingURL=dataPointFactory.js.map