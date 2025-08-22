import {
  BIGINT_0,
  bigIntToBytes,
  bytesToHex,
  setLengthLeft,
} from '@synthesizer-libs/util';
import { keccak256 } from 'ethereum-cryptography/keccak.js';

import {
  DEFAULT_SOURCE_SIZE,
  STATE_IN_PLACEMENT_INDEX,
  STATIC_IN_PLACEMENT,
  STATIC_IN_PLACEMENT_INDEX,
} from '../../constant/index.js';
import { DataPointFactory } from '../../pointers/index.js';
import type { CreateDataPointParams, DataPt, SubcircuitNames } from '../../types/index.js';
import type { StateManager } from './stateManager.js';
import type { IDataLoaderProvider } from './dataLoaderProvider.js';

export class DataLoader {
  constructor(
    private provider: IDataLoaderProvider,
    private state: StateManager,
  ) {}

  public loadPUSH(
    codeAddress: string,
    programCounter: number,
    value: bigint,
    size: number,
  ): DataPt {
    const source = STATIC_IN_PLACEMENT_INDEX
    const inPtRaw: CreateDataPointParams = {
      extSource: `code: ${codeAddress}`,
      type: `PUSH${size}`,
      offset: programCounter + 1,
      source,
      wireIndex: this.state.placements.get(source)!.inPts
        .length,
      value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const inPt: DataPt = DataPointFactory.create(inPtRaw);

    return this.provider.addWireToInBuffer(inPt, inPt.source);
  }

  public loadEnvInf(
    codeAddress: string,
    type: string,
    value: bigint,
    _offset?: number,
    size?: number,
  ): DataPt {
    const offset = _offset ?? 0;
    const sourceSize = size ?? DEFAULT_SOURCE_SIZE;
    const source = STATIC_IN_PLACEMENT_INDEX
    const uniqueId = {
      extSource: `code: ${codeAddress}`,
      type,
      offset,
      sourceSize,
    };
    const key = JSON.stringify({ ...uniqueId, value: value.toString(16) });
    if (this.state.envInf.has(key)) {
      return this.state.placements.get(source)!.outPts[
        this.state.envInf.get(key)!.wireIndex
      ];
    }
    const inPtRaw: CreateDataPointParams = {
      ...uniqueId,
      source,
      wireIndex: this.state.placements.get(source)!.inPts
        .length,
      value,
    };
    const inPt = DataPointFactory.create(inPtRaw);
    const outPt = this.provider.addWireToInBuffer(inPt, source);
    const envInfEntry = {
      value,
      wireIndex: outPt.wireIndex!,
    };
    this.state.envInf.set(key, envInfEntry);
    return outPt;
  }

  public loadStorage(codeAddress: string, key: bigint, value: bigint): DataPt {
    const keyString = JSON.stringify({
      address: codeAddress,
      key: key.toString(16),
    });
    let inPt: DataPt;
    if (this.state.storagePt.has(keyString)) {
      // Warm access to the address and key, so we reuse the already registered output of the buffer.
      return this.state.storagePt.get(keyString)!;
    } else {
      // The first access to the address and key
      // Register it to the buffer and the storagePt
      // In the future, this part will be replaced with merkle proof verification (the storage dataPt will not be registered in the buffer).
      // COMPUTE MERKLE PROOF
      const source = STATE_IN_PLACEMENT_INDEX
      const inPtRaw: CreateDataPointParams = {
        extSource: `Load storage: ${codeAddress}`,
        key: '0x' + key.toString(16),
        source,
        wireIndex: this.state.placements.get(source)!.inPts
          .length,
        value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      };
      inPt = DataPointFactory.create(inPtRaw);
      // Registering it to the buffer
      const outPt = this.provider.addWireToInBuffer(
        inPt,
        inPt.source,
      );
      // Registering it to the storagePt
      this.state.storagePt.set(keyString, outPt);
      return outPt;
    }
  }

  public storeStorage(codeAddress: string, key: bigint, inPt: DataPt): void {
    const keyString = JSON.stringify({
      address: codeAddress,
      key: key.toString(16),
    });
    // By just updating the storagePt, the Synthesizer can track down where the data comes from, whenever it is loaded next time.
    this.state.storagePt.set(keyString, inPt);
    // We record the storage modification in the placements just for users to aware of it (it is not for the Synthesizer).
    const outPtRaw: CreateDataPointParams = {
      extDest: `Write storage: ${codeAddress}`,
      key: '0x' + key.toString(16),
      source: PRV_OUT_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PRV_OUT_PLACEMENT_INDEX)!.outPts
        .length,
      value: inPt.value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const outPt = DataPointFactory.create(outPtRaw);
    this.provider.addWireToOutBuffer(inPt, outPt, PRV_OUT_PLACEMENT_INDEX);
  }

  public storeLog(valPts: DataPt[], topicPts: DataPt[]): void {
    this.state.logPt.push({ valPts, topicPts });
    let logKey = BigInt(this.state.logPt.length - 1);
    let outWireIndex = this.state.placements.get(PRV_OUT_PLACEMENT_INDEX)!
      .outPts.length;
    // Create output data point for topics
    for (const [index, topicPt] of topicPts.entries()) {
      const outPtRaw: CreateDataPointParams = {
        extDest: 'LOG',
        key: '0x' + logKey.toString(16),
        type: `topic${index}`,
        source: PRV_OUT_PLACEMENT_INDEX,
        wireIndex: outWireIndex++,
        value: topicPt.value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      };
      const topicOutPt = DataPointFactory.create(outPtRaw);
      // Add input-output pair to the buffer
      this.provider.addWireToOutBuffer(
        topicPt,
        topicOutPt,
        PRV_OUT_PLACEMENT_INDEX,
      );
    }

    // Create output data point
    for (const [index, valPt] of valPts.entries()) {
      const outPtRaw: CreateDataPointParams = {
        extDest: 'LOG',
        key: '0x' + logKey.toString(16),
        type: `value${index}`,
        source: PRV_OUT_PLACEMENT_INDEX,
        wireIndex: outWireIndex++,
        value: valPt.value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      };
      const valOutPt = DataPointFactory.create(outPtRaw);
      // Add input-output pair to the buffer
      this.provider.addWireToOutBuffer(
        valPt,
        valOutPt,
        PRV_OUT_PLACEMENT_INDEX,
      );
    }
  }
  
  public loadBlkInf(blkNumber: bigint, type: string, value: bigint): DataPt {
    let hexRaw = value.toString(16);
    const paddedHex = hexRaw.length % 2 === 1 ? '0' + hexRaw : hexRaw;
    const valueHex = '0x' + paddedHex;
    const blockInfo = {
      extSource: `block number: ${Number(blkNumber)}`,
      type,
      valueHex,
    };
    const key = JSON.stringify(blockInfo);
    if (this.state.blkInf.has(key)) {
      // Warm access
      return this.state.placements.get(PRV_IN_PLACEMENT_INDEX)!.outPts[
        this.state.blkInf.get(key)!.wireIndex
      ];
    }
    const inPt: DataPt = {
      ...blockInfo,
      source: PRV_IN_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts
        .length,
      value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const outPt = this.provider.addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
    const blkInfEntry = {
      value,
      wireIndex: outPt.wireIndex!,
    };
    this.state.blkInf.set(key, blkInfEntry);
    return outPt;
  }

  // public loadAuxin(value: bigint, size?: number): DataPt {
  //   const sourceSize = size ?? DEFAULT_SOURCE_SIZE;
  //   if (this.state.auxin.has(value)) {
  //     return this.state.placements.get()!.outPts[
  //       this.state.auxin.get(value)!
  //     ];
  //   }
  //   const inPtRaw: CreateDataPointParams = {
  //     extSource: 'auxin',
  //     source: PRV_IN_PLACEMENT_INDEX,
  //     wireIndex: this.state.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts
  //       .length,
  //     value,
  //     sourceSize,
  //   };
  //   const inPt = DataPointFactory.create(inPtRaw);
  //   const outPt = this.provider.addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
  //   this.state.auxin.set(value, outPt.wireIndex!);
  //   return outPt;
  // }

  public loadStatic(value: bigint, subcircuit: SubcircuitNames, size?: number): DataPt {
    const sourceSize = size ?? DEFAULT_SOURCE_SIZE;
    const source = STATIC_IN_PLACEMENT_INDEX
    const inPtRaw: CreateDataPointParams = {
      extSource: `Static input used for a subcircuit ${subcircuit}`,
      source,
      wireIndex: this.state.placements.get(STATIC_IN_PLACEMENT_INDEX)!.inPts
        .length,
      value,
      sourceSize,
    };
    const inPt = DataPointFactory.create(inPtRaw);
    const outPt = this.provider.addWireToInBuffer(inPt, source);
    return outPt;
  }

  private _processKeccakInputs(
    inPts: DataPt[],
    length: bigint,
  ): { value: bigint; inValues: bigint[] } {
    const nChunks = inPts.length;
    const lengthNum = Number(length);
    let value = BIGINT_0;
    const inValues: bigint[] = [];
    let lengthLeft = lengthNum;

    for (let i = 0; i < nChunks; i++) {
      const _length = lengthLeft > 32 ? 32 : lengthLeft;
      lengthLeft -= _length;
      value += inPts[i].value << BigInt(lengthLeft * 8);
      inValues[i] = inPts[i].value;
    }
    return { value, inValues };
  }

  private _executeAndValidateKeccak(
    value: bigint,
    length: bigint,
    expectedOutValue: bigint,
  ): void {
    const lengthNum = Number(length);
    let data: Uint8Array;
    if (length !== 0n) {
      const valueInBytes = bigIntToBytes(value);
      data = setLengthLeft(valueInBytes, lengthNum ?? valueInBytes.length);
    } else {
      data = new Uint8Array(0);
    }
    const actualOutValue = BigInt(bytesToHex(keccak256(data)));
    if (actualOutValue !== expectedOutValue) {
      throw new Error(
        `Synthesizer: loadAndStoreKeccak: The Keccak hash may be customized`,
      );
    }
  }

  private _recordKeccakToBuffers(
    inPts: DataPt[],
    outValue: bigint,
    keccakKey: bigint,
  ): DataPt {
    // Add the inputs to the public output buffer
    let outWireIndex = this.state.placements.get(PUB_OUT_PLACEMENT_INDEX)!
      .outPts.length;
    for (let i = 0; i < inPts.length; i++) {
      const outPtRaw: CreateDataPointParams = {
        extDest: 'KeccakIn',
        key: '0x' + keccakKey.toString(16),
        offset: i,
        source: PUB_OUT_PLACEMENT_INDEX,
        wireIndex: outWireIndex++,
        value: inPts[i].value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      };
      const outPt = DataPointFactory.create(outPtRaw);
      this.provider.addWireToOutBuffer(
        inPts[i],
        outPt,
        PUB_OUT_PLACEMENT_INDEX,
      );
    }

    // Add the output to the public input buffer
    const inPtRaw: CreateDataPointParams = {
      extSource: 'KeccakOut',
      key: '0x' + keccakKey.toString(16),
      source: PUB_IN_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PUB_IN_PLACEMENT_INDEX)!.inPts
        .length,
      value: outValue,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const inPt = DataPointFactory.create(inPtRaw);
    return this.provider.addWireToInBuffer(inPt, PUB_IN_PLACEMENT_INDEX);
  }

  public loadAndStoreKeccak(
    inPts: DataPt[],
    outValue: bigint,
    length: bigint,
  ): DataPt {
    const { value, inValues } = this._processKeccakInputs(inPts, length);
    this._executeAndValidateKeccak(value, length, outValue);

    this.state.keccakPt.push({ inValues, outValue });
    const keccakKey = BigInt(this.state.keccakPt.length - 1);

    return this._recordKeccakToBuffers(inPts, outValue, keccakKey);
  }
}
