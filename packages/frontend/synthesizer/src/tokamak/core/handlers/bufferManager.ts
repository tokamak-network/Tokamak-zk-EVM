import { DataPtFactory } from '../../pointers/index.js';
import { BUFFER_PLACEMENT, DataPtDescription, L2TxData, ReservedBuffer, SynthesizerOpts, VARIABLE_DESCRIPTION, type DataPt, type ReservedVariable } from '../../types/index.js';
import { MAX_TX_NUMBER } from 'src/tokamak/constant/index.ts';
import { bytesToBigInt } from '@ethereumjs/util';
import { jubjub } from '@noble/curves/misc';
import { ISynthesizerProvider } from './index.ts';

export class BufferManager {
  private parent: ISynthesizerProvider

  constructor(
    parent: ISynthesizerProvider,
    opts: SynthesizerOpts,
  ) {
    this.parent = parent
    this._initBuffers(opts);
  }

  public addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
    // Use the length of existing output list as index for new output
    if (
      this.parent.placements.get(placementId)!.inPts.length !==
      this.parent.placements.get(placementId)!.outPts.length
    ) {
      throw new Error(
        `Synthesizer: Mismatch in the buffer wires (placement id: ${placementId})`,
      );
    }
    const outWireIndex = this.parent.placements.get(placementId)!.outPts.length;
    // Create output data point
    const outPtRaw: DataPtDescription = {
      source: placementId,
      wireIndex: outWireIndex,
      sourceSize: inPt.sourceSize,
    };
    const outPt = DataPtFactory.create(outPtRaw, inPt.value);

    // Add input-output pair to the input buffer subcircuit
    this.parent.placements.get(placementId)!.inPts.push(inPt);
    this.parent.placements.get(placementId)!.outPts.push(outPt);

    return this.parent.placements.get(placementId)!.outPts[outWireIndex];
  }

  public addWireToOutBuffer(
    inPt: DataPt,
    outPt: DataPt,
    placementId: number,
  ): void {
    // Use the length of existing output list as index for new output
    if (
      this.parent.placements.get(placementId)!.inPts.length !==
        this.parent.placements.get(placementId)!.outPts.length ||
      inPt.value !== outPt.value
    ) {
      throw new Error(
        `Synthesizer: Mismatches in the buffer wires (placement id: ${placementId})`,
      );
    }
    let outPtIdx = this.parent.placements.get(placementId)!.outPts.length;
    if (outPt.wireIndex !== outPtIdx) {
      throw new Error(
        `Synthesizer: Invalid indexing in the output wire of an output buffer (placement id: ${placementId}, wire id: ${outPtIdx})`,
      );
    }
    // Add input-output pair to the output buffer subcircuit
    this.parent.placements.get(placementId)!.inPts.push(inPt);
    this.parent.placements.get(placementId)!.outPts.push(outPt);
  }

  public readReservedVariableFromInputBuffer(varName: ReservedVariable, txNonce?: number): DataPt {
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

  /**
   * Initializes the default placements for public/private inputs and outputs.
   */
  private _initBuffers(opts: SynthesizerOpts): void {
    const __addInputBufferWire = (varName: ReservedVariable, value: bigint): void => {
      const placementIndex = VARIABLE_DESCRIPTION[varName].source
      if (placementIndex === BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex) {
        throw new Error('Use "_addInputBufferWireForTxIn", instead')
      }
      const {inPt, outPt} = DataPtFactory.createForBufferInit(VARIABLE_DESCRIPTION[varName], value)
      this.parent.placements.get(placementIndex)!.inPts.push(inPt)
      this.parent.placements.get(placementIndex)!.outPts.push(outPt)
    }

    const __writeTxDataToBuffers = (l2TxData: L2TxData[]): void => {
      const ___dynamicWireInjection = (varName: ReservedVariable, value: bigint, baseWireIndex: number): void => {
        const desc: DataPtDescription = VARIABLE_DESCRIPTION[varName]
        const { inPt, outPt } = DataPtFactory.createForBufferInit(
          { ...desc, wireIndex: desc.wireIndex + baseWireIndex },
          value
        )
        const place = this.parent.placements.get(VARIABLE_DESCRIPTION[varName].source)!
        place.inPts.push(inPt)
        place.outPts.push(outPt)
      }
      for (const l2Tx of l2TxData) {
        if (l2Tx.nonce > MAX_TX_NUMBER) {
          throw new Error(`Transaction nonce exceeds the maximum number of transactions ${MAX_TX_NUMBER}`)
        }
        const nonce = Number(l2Tx.nonce)
        // The constant 3 is for EDDSA signature, EDDSA randomizer x, EDDSA randomizer y
        const basePubInWireIndex = 3 * nonce
        // The constant 12 is for tx nonce, to address, function selector, 9 inputs.
        const baseTxInWireIndex = 12 * nonce
        ___dynamicWireInjection('EDDSA_SIGNATURE', l2Tx.eddsaSignature.eddsaSign, basePubInWireIndex)
        ___dynamicWireInjection('EDDSA_RANDOMIZER_X', l2Tx.eddsaSignature.eddsaRand.x, basePubInWireIndex)
        ___dynamicWireInjection('EDDSA_RANDOMIZER_Y', l2Tx.eddsaSignature.eddsaRand.y, basePubInWireIndex)
        ___dynamicWireInjection('TRANSACTION_NONCE', l2Tx.nonce, baseTxInWireIndex)
        ___dynamicWireInjection('CONTRACT_ADDRESS', bytesToBigInt(l2Tx.to.toBytes()), baseTxInWireIndex)
        ___dynamicWireInjection('FUNCTION_SELECTOR', l2Tx.functionSelector, baseTxInWireIndex)
        ___dynamicWireInjection(`TRANSACTION_INPUT0`, l2Tx.functionInputs[0], baseTxInWireIndex)
        ___dynamicWireInjection(`TRANSACTION_INPUT1`, l2Tx.functionInputs[1], baseTxInWireIndex)
        ___dynamicWireInjection(`TRANSACTION_INPUT2`, l2Tx.functionInputs[2], baseTxInWireIndex)
        ___dynamicWireInjection(`TRANSACTION_INPUT3`, l2Tx.functionInputs[3], baseTxInWireIndex)
        ___dynamicWireInjection(`TRANSACTION_INPUT4`, l2Tx.functionInputs[4], baseTxInWireIndex)
        ___dynamicWireInjection(`TRANSACTION_INPUT5`, l2Tx.functionInputs[5], baseTxInWireIndex)
        ___dynamicWireInjection(`TRANSACTION_INPUT6`, l2Tx.functionInputs[6], baseTxInWireIndex)
        ___dynamicWireInjection(`TRANSACTION_INPUT7`, l2Tx.functionInputs[7], baseTxInWireIndex)
        ___dynamicWireInjection(`TRANSACTION_INPUT8`, l2Tx.functionInputs[8], baseTxInWireIndex)
      }
    }
    const initialPlacements: ReservedBuffer[] = [
      'PUB_OUT' as ReservedBuffer,                //output public, input private
      'PUB_IN' as ReservedBuffer,                 //output private, input public
      'STATIC_IN' as ReservedBuffer,              //output private, input public
      'TRANSACTION_IN' as ReservedBuffer,         //output private, input private
      'STORAGE_IN' as ReservedBuffer,             //output private, input private
    ];

    for (const p of initialPlacements) {
      const buffer = BUFFER_PLACEMENT[p]
      const subcircuitInfo = this.parent.state.subcircuitInfoByName.get(buffer.placement.name)
      if (!subcircuitInfo) {
        throw new Error(
          `StateManager: Could not find subcircuit info for placement '${buffer.placement.name}'`,
        )
      }

      this.parent.placements.set(buffer.placementIndex, {
        ...buffer.placement,
        subcircuitId: subcircuitInfo.id,
      })
    }

    // Public inputs
    __addInputBufferWire('INI_MERKLE_ROOT', opts.initMerkleTreeRoot)
    __addInputBufferWire('EDDSA_PUBLIC_KEY_X', opts.eddsaPubKey.x)
    __addInputBufferWire('EDDSA_PUBLIC_KEY_Y', opts.eddsaPubKey.y)

    // Static public inputs
    __addInputBufferWire('ADDRESS_MASK', (1n << 160n) - 1n)
    __addInputBufferWire('JUBJUB_BASE_X', jubjub.Point.BASE.X)
    __addInputBufferWire('JUBJUB_BASE_Y', jubjub.Point.BASE.Y)
    __addInputBufferWire('JUBJUB_POI_X', jubjub.Point.ZERO.X)
    __addInputBufferWire('JUBJUB_POI_Y', jubjub.Point.ZERO.Y)
    
    // Transaction inputs
    __writeTxDataToBuffers(opts.transactions)
  }
}
