import { DataPtFactory } from '../../pointers/index.js';
import { BUFFER_PLACEMENT, DataPtDescription, L2TxData, ReservedBuffer, SynthesizerOpts, VARIABLE_DESCRIPTION, type DataPt, type ReservedVariable } from '../../types/index.js';
import { MAX_MT_LEAVES, MAX_TX_NUMBER, USER_INPUT_DYNAMIC_INDEX } from 'src/tokamak/constant/index.ts';
import { addHexPrefix, bytesToBigInt, hexToBigInt, PrefixedHexString } from '@ethereumjs/util';
import { jubjub } from '@noble/curves/misc';
import { ISynthesizerProvider } from './index.ts';

export class BufferManager {
  private parent: ISynthesizerProvider

  constructor(
    parent: ISynthesizerProvider,
    opts: SynthesizerOpts,
  ) {
    this.parent = parent
    this._initBuffers(opts)
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
      sourceBitSize: inPt.sourceBitSize,
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

  /**
   * Initializes the default placements for public/private inputs and outputs.
   */
  private _initBuffers(opts: SynthesizerOpts): void {
    const __addInputBufferWire = (varName: ReservedVariable, value: bigint, iterIdx?: number, iterSize: number = 1): DataPt => {
      const placementIndex = VARIABLE_DESCRIPTION[varName].source
      const wireDesc: DataPtDescription = VARIABLE_DESCRIPTION[varName]
      if (iterIdx !== undefined) {
        wireDesc.extDest += `(index: ${iterIdx})`
        wireDesc.wireIndex += iterSize * iterIdx
      }
      const {inPt, outPt} = DataPtFactory.createForBufferInit(wireDesc, value)
      const placement = this.parent.placements.get(placementIndex)!
      if (inPt.wireIndex !== placement.inPts.length || outPt.wireIndex !== placement.outPts.length || inPt.wireIndex !== outPt.wireIndex) {
        throw new Error(`Wire index mismatch while initializing buffers`)
      }
      this.parent.placements.get(placementIndex)!.inPts.push(inPt)
      this.parent.placements.get(placementIndex)!.outPts.push(outPt)
      return outPt
    }
    const __addUnusedBufferWire = (buffer: ReservedBuffer): void => {
      const placementIndex = BUFFER_PLACEMENT[buffer].placementIndex
      const placement = this.parent.placements.get(placementIndex)!
      const inPtDesc: DataPtDescription = {
        source: placementIndex,
        sourceBitSize: 1,
        wireIndex: placement.inPts.length
      }
      const {inPt, outPt} = DataPtFactory.createForBufferInit(inPtDesc, 0n)
      if (outPt.wireIndex !== placement.outPts.length || inPt.wireIndex !== outPt.wireIndex) {
        throw new Error(`Wire index mismatch while initializing buffers`)
      }
      this.parent.placements.get(placementIndex)!.inPts.push(inPt)
      this.parent.placements.get(placementIndex)!.outPts.push(outPt)
    }

    const initialPlacements: ReservedBuffer[] = [
      'USER_OUT',                //output public, input private
      'USER_IN',                 //output private, input public
      'BLOCK_IN',               //output private, input public
      'BLOCKHASH_IN',              //output private, input public
      'STATIC_IN',              //output private, input public
      'TRANSACTION_IN',         //output private, input private
      'STORAGE_IN',             //output private, input private
      'STORAGE_OUT',             //output private, input private
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

    // User inputs
    __addInputBufferWire('INI_MERKLE_ROOT', opts.initMerkleTreeRoot)
    __addInputBufferWire('EDDSA_PUBLIC_KEY_X', opts.eddsaPubKey.x)
    __addInputBufferWire('EDDSA_PUBLIC_KEY_Y', opts.eddsaPubKey.y)
    const nUnusedWires = USER_INPUT_DYNAMIC_INDEX - this.parent.state.placements.get(BUFFER_PLACEMENT['USER_IN'].placementIndex)!.inPts.length
    for (let i = 0; i < nUnusedWires; i++) {
      __addUnusedBufferWire('USER_IN')
    }
    for (var i = 0; i < MAX_TX_NUMBER; i++) {
      const l2Tx = opts.transactions[i]
      const nonce = Number(l2Tx.nonce)
      if (nonce > MAX_TX_NUMBER) {
        throw new Error(`Transaction nonce exceeds the maximum number of transactions ${MAX_TX_NUMBER}`)
      }
      if (l2Tx !== undefined) {
        __addInputBufferWire('EDDSA_SIGNATURE', l2Tx.eddsaSignature.eddsaSign, nonce, 3)
        __addInputBufferWire('EDDSA_RANDOMIZER_X', l2Tx.eddsaSignature.eddsaRand.x, nonce, 3)
        __addInputBufferWire('EDDSA_RANDOMIZER_Y', l2Tx.eddsaSignature.eddsaRand.y, nonce, 3)
      } else {
        __addUnusedBufferWire('USER_IN')
        __addUnusedBufferWire('USER_IN')
        __addUnusedBufferWire('USER_IN')
      }
    }

    // Block inputs
    __addInputBufferWire('COINBASE', opts.blockInput.coinBase)
    __addInputBufferWire('TIMESTAMP', opts.blockInput.timeStamp)
    __addInputBufferWire('NUMBER', opts.blockInput.blockNumber)
    __addInputBufferWire('PREVRANDAO', opts.blockInput.prevRanDao)
    __addInputBufferWire('GASLIMIT', opts.blockInput.gasLimit)
    __addInputBufferWire('CHAINID', opts.blockInput.chainId)
    __addInputBufferWire('SELFBALANCE', opts.blockInput.selfBalance)
    __addInputBufferWire('BASEFEE', opts.blockInput.baseFee)

    // Block hashes
    for (var i = 1; i <= 256; i++) {
      __addInputBufferWire(`BLOCKHASH_${i}` as ReservedVariable, opts.blockHashes[i-1])
    }

    // Static public inputs
    __addInputBufferWire('ADDRESS_MASK', (1n << 160n) - 1n)
    __addInputBufferWire('JUBJUB_BASE_X', jubjub.Point.BASE.X)
    __addInputBufferWire('JUBJUB_BASE_Y', jubjub.Point.BASE.Y)
    __addInputBufferWire('JUBJUB_POI_X', jubjub.Point.ZERO.X)
    __addInputBufferWire('JUBJUB_POI_Y', jubjub.Point.ZERO.Y)
    
    // Transaction inputs
    for (var i = 0; i < MAX_TX_NUMBER; i++) {
      const l2Tx = opts.transactions[i]
      const nonce = Number(l2Tx.nonce)
      if (nonce > MAX_TX_NUMBER) {
        throw new Error(`Transaction nonce exceeds the maximum number of transactions ${MAX_TX_NUMBER}`)
      }
      if (l2Tx !== undefined){
        __addInputBufferWire('TRANSACTION_NONCE', l2Tx.nonce, nonce, 12)
        __addInputBufferWire('CONTRACT_ADDRESS', bytesToBigInt(l2Tx.to.toBytes()), nonce, 12)
        __addInputBufferWire('FUNCTION_SELECTOR', l2Tx.functionSelector, nonce, 12)
        __addInputBufferWire(`TRANSACTION_INPUT0`, l2Tx.functionInputs[0], nonce, 12)
        __addInputBufferWire(`TRANSACTION_INPUT1`, l2Tx.functionInputs[1], nonce, 12)
        __addInputBufferWire(`TRANSACTION_INPUT2`, l2Tx.functionInputs[2], nonce, 12)
        __addInputBufferWire(`TRANSACTION_INPUT3`, l2Tx.functionInputs[3], nonce, 12)
        __addInputBufferWire(`TRANSACTION_INPUT4`, l2Tx.functionInputs[4], nonce, 12)
        __addInputBufferWire(`TRANSACTION_INPUT5`, l2Tx.functionInputs[5], nonce, 12)
        __addInputBufferWire(`TRANSACTION_INPUT6`, l2Tx.functionInputs[6], nonce, 12)
        __addInputBufferWire(`TRANSACTION_INPUT7`, l2Tx.functionInputs[7], nonce, 12)
        __addInputBufferWire(`TRANSACTION_INPUT8`, l2Tx.functionInputs[8], nonce, 12)
      } else {
        for (var k = 0; k < 12; k++){
          __addUnusedBufferWire('TRANSACTION_IN')
        }
      }
    }

    const storageInputByIndex: { key: bigint; value: bigint }[] = [];
    for (const [key, { index, value }] of opts.storageInput) {
      if (storageInputByIndex[index] !== undefined) {
        throw new Error('Error in the input storage data')
      }
      storageInputByIndex[index] = { key, value }
    }
    // TODO: Will remove storage input buffers and place Merkle proof verification placements.
    // Storage inputs
    for (var i = 0; i < MAX_MT_LEAVES; i++) {
      const storageInput = storageInputByIndex[i]
      if (storageInput !== undefined) {
        this.parent.state.cachedStorage.set(storageInput.key, {index: i, dataPt: __addInputBufferWire('VALUE', storageInput.value)})
      } else {
        __addUnusedBufferWire('STORAGE_IN')
      }
    }
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
}
