import { SynthesizerValidator } from '../validation/index.js'

import type { CreateDataPointParams, DataPt } from '../types/index.js'

export class DataPointFactory {
  public static create(params: CreateDataPointParams): DataPt {
    SynthesizerValidator.validateValue(params.value)
    const hex = params.value.toString(16);
    const paddedHex = hex.length % 2 === 1 ? '0' + hex : hex;
    const valueHex = '0x' + paddedHex;

    return {
      ...params,
      valueHex,
    }
  }
}
