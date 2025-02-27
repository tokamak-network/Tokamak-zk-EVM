import { SynthesizerValidator } from '../validation/index.js'

import type { CreateDataPointParams, DataPt } from '../types/index.js'

export class DataPointFactory {
  public static create(params: CreateDataPointParams): DataPt {
    SynthesizerValidator.validateValue(params.value)

    return {
      ...params,
      valueHex: params.value.toString(16),
    }
  }
}
