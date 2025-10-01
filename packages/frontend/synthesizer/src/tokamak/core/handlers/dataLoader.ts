import {
  BIGINT_0,
  bigIntToBytes,
  bytesToHex,
  setLengthLeft,
} from '@synthesizer-libs/util';
import { keccak256 } from 'ethereum-cryptography/keccak.js';

import {
  DEFAULT_SOURCE_SIZE,
} from '../../constant/index.js';
import { DataPtFactory } from '../../pointers/index.js';
import { BUFFER_PLACEMENT, ReservedVariable, SynthesizerOpts, SynthesizerSupportedOpcodes, VARIABLE_DESCRIPTION, type DataPt, type DataPtDescription, type SubcircuitNames } from '../../types/index.js';
import { ISynthesizerProvider } from './index.ts';
import { createLegacyTxFromL2Tx } from '@tokamak/utils';
import { LegacyTx } from '@ethereumjs/tx';
import { bigIntToHex } from '@ethereumjs/util';

export class DataLoader {
  public transactions: LegacyTx[];
  constructor(
    private parent: ISynthesizerProvider,
    opts: SynthesizerOpts
  ) {
    this.transactions = Array.from(opts.transactions, l2TxData => createLegacyTxFromL2Tx(l2TxData))
  }

  public loadReservedVariableFromBuffer(varName: ReservedVariable, txNonce?: number): DataPt {
      const placementIndex = VARIABLE_DESCRIPTION[varName].source
      let wireIndex: number = VARIABLE_DESCRIPTION[varName].wireIndex
      switch (varName) {
        case 'EDDSA_SIGNATURE':
        case 'EDDSA_RANDOMIZER_X':
        case 'EDDSA_RANDOMIZER_Y':
          if (txNonce === undefined) {
            throw new Error('Reading transaction related variables requires transaction nonce')
          }
          wireIndex += txNonce * 3
          break
        case 'TRANSACTION_NONCE':
        case 'CONTRACT_ADDRESS':
        case 'FUNCTION_SELECTOR':
        case 'TRANSACTION_INPUT0':
        case 'TRANSACTION_INPUT1':
        case 'TRANSACTION_INPUT2':
        case 'TRANSACTION_INPUT3':
        case 'TRANSACTION_INPUT4':
        case 'TRANSACTION_INPUT5':
        case 'TRANSACTION_INPUT6':
        case 'TRANSACTION_INPUT7':
        case 'TRANSACTION_INPUT8':
          if (txNonce === undefined) {
            throw new Error('Reading transaction related variables requires transaction nonce')
          }
          wireIndex += txNonce * 12
          break
        default:
          break
      }
  
      const outPt = this.parent.placements.get(placementIndex)!.outPts[wireIndex]
      if (outPt.wireIndex !== wireIndex || outPt.source !== placementIndex) {
        throw new Error('Invalid wire information')
      }
      return outPt
    }

  public loadArbitraryStatic(
    value: bigint,
    bitSize?: number,
    desc?: string,
  ): DataPt {
    if (desc === undefined) {
      const cachedDataPt = this.parent.state.cachedStaticIn.get(value)
      if (cachedDataPt !== undefined) {
        return cachedDataPt
      }
    }
    const placementIndex = BUFFER_PLACEMENT.STATIC_IN.placementIndex
    const inPtRaw: DataPtDescription = {
      extSource: desc ?? 'Arbitrary constant',
      sourceBitSize: bitSize ?? DEFAULT_SOURCE_SIZE * 8,
      source: placementIndex,
      wireIndex: this.parent.placements.get(placementIndex)!.inPts.length,
    };
    const inPt = DataPtFactory.create(inPtRaw, value)
    const outPt = this.parent.addWireToInBuffer(inPt, placementIndex)
    this.parent.state.cachedStaticIn.set(value, outPt)
    return outPt
  }

  public loadStorage(key: bigint): DataPt {
    const cache = this.parent.state.cachedStorage.get(key)
    if (cache === undefined) {
      throw new Error(`Invalid access to the storage at an unregistered key "${bigIntToHex(key)}"`)
    }
    return cache.dataPt
  }

  public storeStorage(key: bigint, inPt: DataPt): void {
    const cache = this.parent.state.cachedStorage.get(key)
    if (cache === undefined) {
      throw new Error(`Invalid access to the storage at an unregistered key "${bigIntToHex(key)}"`)
    }
    this.parent.state.cachedStorage.set(key, {
      index: cache.index,
      dataPt: inPt,
    })
  }

  // public storeLog(valPts: DataPt[], topicPts: DataPt[]): void {
  //   this.parent.state.logPt.push({ valPts, topicPts });
  //   let logKey = BigInt(this.parent.state.logPt.length - 1);
  //   let outWireIndex = this.parent.placements.get(PRV_OUT_PLACEMENT_INDEX)!
  //     .outPts.length;
  //   // Create output data point for topics
  //   for (const [index, topicPt] of topicPts.entries()) {
  //     const outPtRaw: DataPtDescription = {
  //       extDest: 'LOG',
  //       key: '0x' + logKey.toString(16),
  //       type: `topic${index}`,
  //       source: PRV_OUT_PLACEMENT_INDEX,
  //       wireIndex: outWireIndex++,
  //       value: topicPt.value,
  //       sourceSize: DEFAULT_SOURCE_SIZE,
  //     };
  //     const topicOutPt = DataPointFactory.create(outPtRaw);
  //     // Add input-output pair to the buffer
  //     this.parent.addWireToOutBuffer(
  //       topicPt,
  //       topicOutPt,
  //       PRV_OUT_PLACEMENT_INDEX,
  //     );
  //   }

  //   // Create output data point
  //   for (const [index, valPt] of valPts.entries()) {
  //     const outPtRaw: DataPtDescription = {
  //       extDest: 'LOG',
  //       key: '0x' + logKey.toString(16),
  //       type: `value${index}`,
  //       source: PRV_OUT_PLACEMENT_INDEX,
  //       wireIndex: outWireIndex++,
  //       value: valPt.value,
  //       sourceSize: DEFAULT_SOURCE_SIZE,
  //     };
  //     const valOutPt = DataPointFactory.create(outPtRaw);
  //     // Add input-output pair to the buffer
  //     this.parent.addWireToOutBuffer(
  //       valPt,
  //       valOutPt,
  //       PRV_OUT_PLACEMENT_INDEX,
  //     );
  //   }
  // }

  // public loadAuxin(value: bigint, size?: number): DataPt {
  //   const sourceSize = size ?? DEFAULT_SOURCE_SIZE;
  //   if (this.parent.state.auxin.has(value)) {
  //     return this.parent.placements.get()!.outPts[
  //       this.parent.state.auxin.get(value)!
  //     ];
  //   }
  //   const inPtRaw: DataPtDescription = {
  //     extSource: 'auxin',
  //     source: PRV_IN_PLACEMENT_INDEX,
  //     wireIndex: this.parent.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts
  //       .length,
  //     value,
  //     sourceSize,
  //   };
  //   const inPt = DataPointFactory.create(inPtRaw);
  //   const outPt = this.parent.addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
  //   this.parent.state.auxin.set(value, outPt.wireIndex!);
  //   return outPt;
  // }

//   private _processKeccakInputs(
//     inPts: DataPt[],
//     length: bigint,
//   ): { value: bigint; inValues: bigint[] } {
//     const nChunks = inPts.length;
//     const lengthNum = Number(length);
//     let value = BIGINT_0;
//     const inValues: bigint[] = [];
//     let lengthLeft = lengthNum;

//     for (let i = 0; i < nChunks; i++) {
//       const _length = lengthLeft > 32 ? 32 : lengthLeft;
//       lengthLeft -= _length;
//       value += inPts[i].value << BigInt(lengthLeft * 8);
//       inValues[i] = inPts[i].value;
//     }
//     return { value, inValues };
//   }

//   private _executeAndValidateKeccak(
//     value: bigint,
//     length: bigint,
//     expectedOutValue: bigint,
//   ): void {
//     const lengthNum = Number(length);
//     let data: Uint8Array;
//     if (length !== 0n) {
//       const valueInBytes = bigIntToBytes(value);
//       data = setLengthLeft(valueInBytes, lengthNum ?? valueInBytes.length);
//     } else {
//       data = new Uint8Array(0);
//     }
//     const actualOutValue = BigInt(bytesToHex(keccak256(data)));
//     if (actualOutValue !== expectedOutValue) {
//       throw new Error(
//         `Synthesizer: loadAndStoreKeccak: The Keccak hash may be customized`,
//       );
//     }
//   }

//   private _recordKeccakToBuffers(
//     inPts: DataPt[],
//     outValue: bigint,
//     keccakKey: bigint,
//   ): DataPt {
//     // Add the inputs to the public output buffer
//     let outWireIndex = this.parent.placements.get(PUB_OUT_PLACEMENT_INDEX)!
//       .outPts.length;
//     for (let i = 0; i < inPts.length; i++) {
//       const outPtRaw: DataPtDescription = {
//         extDest: 'KeccakIn',
//         key: '0x' + keccakKey.toString(16),
//         offset: i,
//         source: PUB_OUT_PLACEMENT_INDEX,
//         wireIndex: outWireIndex++,
//         value: inPts[i].value,
//         sourceSize: DEFAULT_SOURCE_SIZE,
//       };
//       const outPt = DataPointFactory.create(outPtRaw);
//       this.parent.addWireToOutBuffer(
//         inPts[i],
//         outPt,
//         PUB_OUT_PLACEMENT_INDEX,
//       );
//     }

//     // Add the output to the public input buffer
//     const inPtRaw: DataPtDescription = {
//       extSource: 'KeccakOut',
//       key: '0x' + keccakKey.toString(16),
//       source: PUB_IN_PLACEMENT_INDEX,
//       wireIndex: this.parent.placements.get(PUB_IN_PLACEMENT_INDEX)!.inPts
//         .length,
//       value: outValue,
//       sourceSize: DEFAULT_SOURCE_SIZE,
//     };
//     const inPt = DataPointFactory.create(inPtRaw);
//     return this.parent.addWireToInBuffer(inPt, PUB_IN_PLACEMENT_INDEX);
//   }

//   public loadAndStoreKeccak(
//     inPts: DataPt[],
//     outValue: bigint,
//     length: bigint,
//   ): DataPt {
//     const { value, inValues } = this._processKeccakInputs(inPts, length);
//     this._executeAndValidateKeccak(value, length, outValue);

//     this.parent.state.keccakPt.push({ inValues, outValue });
//     const keccakKey = BigInt(this.parent.state.keccakPt.length - 1);

//     return this._recordKeccakToBuffers(inPts, outValue, keccakKey);
//   }
}
