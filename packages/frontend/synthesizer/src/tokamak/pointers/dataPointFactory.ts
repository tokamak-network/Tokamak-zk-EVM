import { SynthesizerValidator } from '../validation/index.js'

import type { DataPtDescription, DataPt } from '../types/index.js'
import { bigIntToHex } from '@ethereumjs/util'

export class DataPtFactory {
  public static create(params: DataPtDescription, value: bigint): DataPt {
    SynthesizerValidator.validateValue(params, value)
    return {
      ...params,
      value,
      valueHex: bigIntToHex(value),
    }
  }

  public static createForBufferInit(params: DataPtDescription, value: bigint): {inPt: DataPt, outPt: DataPt} {
    const inPt: DataPt = this.create(params, value)
    const outPt: DataPt = {
      source: inPt.source,
      wireIndex: inPt.wireIndex,
      sourceBitSize: inPt.sourceBitSize,
      value: inPt.value,
      valueHex: inPt.valueHex
    };
    return {inPt, outPt}
  }
}
