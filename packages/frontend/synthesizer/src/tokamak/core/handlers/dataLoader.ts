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
import { BUFFER_PLACEMENT, ReservedVariable, type DataPt, type DataPtDescription, type SubcircuitNames } from '../../types/index.js';
import { ISynthesizerProvider } from './index.ts';

export class DataLoader {
  constructor(
    private parent: ISynthesizerProvider,
  ) {}

  public loadPUSH(
    codeAddress: string,
    programCounter: number,
    value: bigint,
    size: number,
  ): DataPt {
    const source = BUFFER_PLACEMENT.STATIC_IN.placementIndex
    const inPtRaw: DataPtDescription = {
      extSource: `code: ${codeAddress}`,
      type: `PUSH${size}`,
      offset: programCounter + 1,
      source,
      wireIndex: this.parent.placements.get(source)!.inPts
        .length,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const inPt: DataPt = DataPtFactory.create(inPtRaw, value);

    return this.parent.addWireToInBuffer(inPt, inPt.source);
  }

  public loadArbitraryStatic(
    value: bigint,
    size?: number,
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
      extSource: desc ?? 'Constant',
      sourceSize: size ?? DEFAULT_SOURCE_SIZE,
      source: placementIndex,
      wireIndex: this.parent.placements.get(placementIndex)!.inPts.length,
    };
    const inPt = DataPtFactory.create(inPtRaw, value)
    const outPt = this.parent.addWireToInBuffer(inPt, placementIndex)
    this.parent.state.cachedStaticIn.set(value, outPt)
    return outPt
  }

  public loadStorage(codeAddress: string, key: bigint, value: bigint): DataPt {
    const keyString = JSON.stringify({
      address: codeAddress,
      key: key.toString(16),
    });
    let inPt: DataPt;
    if (this.parent.state.cachedStorage.has(keyString)) {
      // Warm access to the address and key, so we reuse the already registered output of the buffer.
      return this.parent.state.cachedStorage.get(keyString)!;
    } else {
      // The first access to the address and key
      // Register it to the buffer and the storagePt
      // In the future, this part will be replaced with merkle proof verification (the storage dataPt will not be registered in the buffer).
      // COMPUTE MERKLE PROOF
      const source = BUFFER_PLACEMENT.STORAGE.placementIndex
      const inPtRaw: DataPtDescription = {
        extSource: `Load storage: ${codeAddress}`,
        key: '0x' + key.toString(16),
        source,
        wireIndex: this.parent.placements.get(source)!.inPts
          .length,
        sourceSize: DEFAULT_SOURCE_SIZE,
      };
      inPt = DataPtFactory.create(inPtRaw, value);
      // Registering it to the buffer
      const outPt = this.parent.addWireToInBuffer(
        inPt,
        inPt.source,
      );
      // Registering it to the storagePt
      this.parent.state.cachedStorage.set(keyString, outPt);
      return outPt;
    }
  }

  public storeStorage(codeAddress: string, key: bigint, inPt: DataPt): void {
    const keyString = JSON.stringify({
      address: codeAddress,
      key: key.toString(16),
    });
    // By just updating the storagePt, the Synthesizer can track down where the data comes from, whenever it is loaded next time.
    this.parent.state.cachedStorage.set(keyString, inPt);
    // We record the storage modification in the placements just for users to aware of it (it is not for the Synthesizer).
    const placementIndex = BUFFER_PLACEMENT.STORAGE.placementIndex
    const outPtRaw: DataPtDescription = {
      extDest: `Write storage: ${codeAddress}`,
      key: '0x' + key.toString(16),
      source: placementIndex,
      wireIndex: this.parent.placements.get(placementIndex)!.outPts
        .length,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const outPt = DataPtFactory.create(outPtRaw, inPt.value);
    this.parent.addWireToOutBuffer(inPt, outPt, placementIndex);
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
  
  public loadBlkInf(op: ReservedVariable, value: bigint): DataPt {
    const outPt = this.parent.readReservedVariableFromInputBuffer(op)
    if (outPt.value !== value) {
      throw new Error('Block information mismatch')
    }
    return outPt;
  }

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
