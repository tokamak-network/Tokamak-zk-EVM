import { bigIntToHex } from '@ethereumjs/util'
import { DataPt, DataPtDescription } from '../types/index.ts'
import { BLS12831ARITHMODULUS, JUBJUBARITHMODULUS } from '../../synthesizer/params/index.ts'

/**
 * Validates if the value is within Ethereum word size limits
 * @param value Value to validate
 * @throws {Error} If value is negative or exceeds word size
 */
function validateValue(params: DataPtDescription, value: bigint): void {
  if (value < 0n) {
    throw new Error('Negative values are not allowed')
  }
  if (value >= 1n << BigInt(params.sourceBitSize)) {
    throw new Error('The value exceeds its source bit size')
  }
  if (params.sourceBitSize === 255 && value >= BLS12831ARITHMODULUS) {
    throw new Error('The value is of 255 bit length but out of BLS12-381 scalar field')
  }
  if (params.sourceBitSize === 252 && value >= JUBJUBARITHMODULUS) {
    throw new Error('The value is of 252 bit length but out of JubJub scalar field')
  }
}

export class DataPtFactory {
  /**
   * Deep-copies a DataPt, a tuple [DataPt, DataPt], or an array of DataPt.
   * The return type is preserved based on the input type (via overloads).
   */
  public static deepCopy(a: DataPt): DataPt;
  public static deepCopy(a: [DataPt, DataPt]): [DataPt, DataPt];
  public static deepCopy(a: readonly [DataPt, DataPt]): [DataPt, DataPt];
  public static deepCopy<T extends ReadonlyArray<DataPt>>(a: T): T;
  public static deepCopy<T extends DataPt | ReadonlyArray<DataPt>>(a: T): T {
    if (Array.isArray(a)) {
      // Handle fixed-length 2-tuple precisely to preserve tuple type
      if (a.length === 2) {
        const [d0, d1] = a as unknown as readonly [DataPt, DataPt];
        const tuple: [DataPt, DataPt] = [{ ...d0 }, { ...d1 }];
        return tuple as unknown as T;
      }
      // General array clone (deep at 1-level; DataPt is a flat object)
      const arr = (a as ReadonlyArray<DataPt>).map((dp) => ({ ...dp }));
      return arr as unknown as T;
    }
    // Single object
    return { ...(a as DataPt) } as T;
  }

  public static create(params: DataPtDescription, value: bigint): DataPt {
    validateValue(params, value)
    return {
      ...params,
      value,
      valueHex: bigIntToHex(value),
    }
  }

  public static createBufferTwin(dataPt: DataPt): DataPt {
    // Create output data point
    const outPtRaw: DataPtDescription = {
      source: dataPt.source,
      wireIndex: dataPt.wireIndex,
      sourceBitSize: dataPt.sourceBitSize,
      iterable: dataPt.iterable,
    };
    return DataPtFactory.create(outPtRaw, dataPt.value);
  }

  // public static createInputBufferWirePair(params: DataPtDescription, value: bigint): {inPt: DataPt, outPt: DataPt} {
  //   const inPt: DataPt = this.create(params, value)
  //   const outPt: DataPt = {
  //     source: inPt.source,
  //     wireIndex: inPt.wireIndex,
  //     sourceBitSize: inPt.sourceBitSize,
  //     value: inPt.value,
  //     valueHex: inPt.valueHex
  //   };
  //   return {inPt, outPt}
  // }
}
