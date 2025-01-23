import { SynthesizerValidator } from '../validation/index.js';
export class DataPointFactory {
    static create(params) {
        SynthesizerValidator.validateValue(params.value);
        return {
            ...params,
            valueHex: params.value.toString(16),
        };
    }
}
//# sourceMappingURL=dataPointFactory.js.map