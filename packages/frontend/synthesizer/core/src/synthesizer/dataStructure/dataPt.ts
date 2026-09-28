import { bigIntToHex } from '@ethereumjs/util';
import { jubjub } from '@noble/curves/misc.js';
import {
  BLS12_381_FR_DATA_PT_TYPE,
  BIT_DATA_PT_TYPE,
  isDataPtType,
  JUBJUB_SCALAR_DATA_PT_TYPE,
  UINT128_DATA_PT_TYPE,
  UINT160_DATA_PT_TYPE,
  UINT256_DATA_PT_TYPE,
  UINT32_DATA_PT_TYPE,
  type DataPt,
  type DataPtDescription,
  type DataPtType,
} from '../types/dataStructure.ts';

function validateValue(dataPtType: DataPtType, value: bigint): void {
  if (value < 0n) {
    throw new Error('DataPt values cannot be negative');
  }

  switch (dataPtType) {
    case BIT_DATA_PT_TYPE:
      if (value >= 2n) throw new Error('DataPt value exceeds its bit domain');
      break;
    case UINT32_DATA_PT_TYPE:
      if (value >= 1n << 32n) throw new Error('DataPt value exceeds its uint32 domain');
      break;
    case UINT128_DATA_PT_TYPE:
      if (value >= 1n << 128n) throw new Error('DataPt value exceeds its uint128 domain');
      break;
    case UINT160_DATA_PT_TYPE:
      if (value >= 1n << 160n) throw new Error('DataPt value exceeds its uint160 domain');
      break;
    case UINT256_DATA_PT_TYPE:
      if (value >= 1n << 256n) throw new Error('DataPt value exceeds its uint256 domain');
      break;
    case BLS12_381_FR_DATA_PT_TYPE:
      if (value >= jubjub.Point.Fp.ORDER) {
        throw new Error('DataPt value is outside the BLS12-381 Fr domain');
      }
      break;
    case JUBJUB_SCALAR_DATA_PT_TYPE:
      if (value >= jubjub.Point.Fn.ORDER) {
        throw new Error('DataPt value is outside the Jubjub scalar domain');
      }
      break;
  }
}

function copyDataPt(dataPt: DataPt): DataPt {
  const { value, valueHex: _valueHex, ...description } = dataPt;
  return DataPtFactory.create(description, value);
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
        const tuple: [DataPt, DataPt] = [copyDataPt(d0), copyDataPt(d1)];
        return tuple as unknown as T;
      }
      const arr = (a as ReadonlyArray<DataPt>).map(copyDataPt);
      return arr as unknown as T;
    }
    return copyDataPt(a as DataPt) as T;
  }

  public static create(params: DataPtDescription, value: bigint): DataPt {
    if ('sourceBitSize' in params) {
      throw new Error('DataPt sourceBitSize is no longer supported');
    }
    if (!isDataPtType(params.dataPtType)) {
      throw new Error('DataPt type must be one of the configured canonical types');
    }
    validateValue(params.dataPtType, value);
    return {
      ...params,
      value,
      valueHex: bigIntToHex(value),
    };
  }

  public static copyEvmWord(dataPt: DataPt): DataPt {
    if (dataPt.dataPtType !== UINT256_DATA_PT_TYPE) {
      throw new Error('DataPt EVM word views require a uint256 data point');
    }
    const {
      value,
      valueHex: _valueHex,
      dataPtType: _dataPtType,
      ...description
    } = dataPt;
    return DataPtFactory.create(
      {
        ...description,
        dataPtType: UINT256_DATA_PT_TYPE,
      },
      value,
    );
  }

  public static createBufferTwin(dataPt: DataPt): DataPt {
    const placementId = dataPt.source;
    const thisWireIndex = dataPt.wireIndex;
    // Create output data point
    const outPtRaw: DataPtDescription = {
      source: placementId,
      wireIndex: thisWireIndex,
      dataPtType: dataPt.dataPtType,
    };
    return DataPtFactory.create(outPtRaw, dataPt.value);
  }
}
