import { SynthesizerValidator } from '../validation/index.js'

import type { DataPtDescription, DataPt } from '../types/index.js'

export class DataPtFactory {
  public static create(params: DataPtDescription, value: bigint): DataPt {
    SynthesizerValidator.validateValue(params, value)
    const hex = value.toString(16)
    const paddedHex = hex.length % 2 === 1 ? '0' + hex : hex;
    const valueHex = '0x' + paddedHex;

    return {
      ...params,
      value,
      valueHex,
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
