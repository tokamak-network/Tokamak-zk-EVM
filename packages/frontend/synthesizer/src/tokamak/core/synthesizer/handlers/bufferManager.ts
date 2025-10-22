import { DataPtFactory } from '../../../pointers/index.ts';
import { BUFFER_PLACEMENT, DataPtDescription, ReservedBuffer, SynthesizerOpts, VARIABLE_DESCRIPTION, type DataPt, type ReservedVariable } from '../../../types/index.ts';
import { MAX_MT_LEAVES, MAX_TX_NUMBER, NUMBER_OF_PREV_BLOCK_HASHES, USER_INPUT_DYNAMIC_OFFSET } from 'src/tokamak/constant/index.ts';
import { addHexPrefix, bigIntToBytes, bytesToBigInt, createAddressFromBigInt, hexToBigInt, PrefixedHexString, toBytes } from '@ethereumjs/util';
import { jubjub } from '@noble/curves/misc';
import { ISynthesizerProvider } from './index.ts';

export class BufferManager {
  private parent: ISynthesizerProvider
  private cachedOpts: SynthesizerOpts

  constructor(
    parent: ISynthesizerProvider,
  ) {
    this.parent = parent
    this.cachedOpts = parent.cachedOpts
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

  private _addInputBufferWire = (varName: ReservedVariable, value: bigint = 0n, iterIdx?: number, iterSize: number = 1): DataPt => {
    const placementIndex = VARIABLE_DESCRIPTION[varName].source
    const wireDesc: DataPtDescription = VARIABLE_DESCRIPTION[varName]
    // Dealing with dynamic buffer wires
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

  /**
   * Initializes the default placements for public/private inputs and outputs.
   */
  public async initBuffers(): Promise<void> {
    const _addUnusedBufferWire = (buffer: ReservedBuffer): void => {
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
    ]

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
    

    // Static public inputs
    this._addInputBufferWire('INI_MERKLE_ROOT', await this.cachedOpts.stateManager.getUpdatedMerkleTreeRoot())

    this._addInputBufferWire('ADDRESS_MASK', (1n << 160n) - 1n)
    this._addInputBufferWire('JUBJUB_BASE_X', jubjub.Point.BASE.X)
    this._addInputBufferWire('JUBJUB_BASE_Y', jubjub.Point.BASE.Y)
    this._addInputBufferWire('JUBJUB_POI_X', jubjub.Point.ZERO.X)
    this._addInputBufferWire('JUBJUB_POI_Y', jubjub.Point.ZERO.Y)

    this._addInputBufferWire('COINBASE', this.cachedOpts.blockInfo.coinBase)
    this._addInputBufferWire('TIMESTAMP', this.cachedOpts.blockInfo.timeStamp)
    this._addInputBufferWire('NUMBER', this.cachedOpts.blockInfo.blockNumber)
    this._addInputBufferWire('PREVRANDAO', this.cachedOpts.blockInfo.prevRanDao)
    this._addInputBufferWire('GASLIMIT', this.cachedOpts.blockInfo.gasLimit)
    this._addInputBufferWire('CHAINID', this.cachedOpts.blockInfo.chainId)
    this._addInputBufferWire('SELFBALANCE', this.cachedOpts.blockInfo.selfBalance)
    this._addInputBufferWire('BASEFEE', this.cachedOpts.blockInfo.baseFee)
    for (var i = 1; i <= NUMBER_OF_PREV_BLOCK_HASHES; i++) {
      this._addInputBufferWire(`BLOCKHASH_${i}` as ReservedVariable, this.cachedOpts.blockInfo.blockHashes[i-1])
    }

    // Transaction inputs
    this._initTransactionBuffer

    // Storage inputs
    await this._initStorageInputBuffer()
  }

  private _initTransactionBuffer(): void {
    const l2Tx = this.cachedOpts.signedTransaction
    const senderPublicKey = l2Tx.v === undefined ? undefined : l2Tx.getUnsafeEddsaPubKey()
    const randomizer = l2Tx.r === undefined ? undefined : l2Tx.getUnsafeEddsaRandomizer()
    this._addInputBufferWire('EDDSA_PUBLIC_KEY_X', senderPublicKey?.X)
    this._addInputBufferWire('EDDSA_PUBLIC_KEY_Y', senderPublicKey?.Y)
    this._addInputBufferWire('EDDSA_RANDOMIZER_X', randomizer?.X)
    this._addInputBufferWire('EDDSA_RANDOMIZER_Y', randomizer?.Y)
    this._addInputBufferWire('EDDSA_SIGNATURE', l2Tx.s)
    this._addInputBufferWire('CONTRACT_ADDRESS', bytesToBigInt(toBytes(l2Tx.to)))
    this._addInputBufferWire('FUNCTION_SELECTOR', bytesToBigInt(l2Tx.getFunctionSelector()))
    for (var inputIndex = 0; inputIndex < MAX_TX_NUMBER; inputIndex ++) {
      this._addInputBufferWire(
        `TRANSACTION_INPUT${inputIndex}` as ReservedVariable, 
        bytesToBigInt(l2Tx.getFunctionInput(inputIndex)),
      )
    }
  }

  private async _initStorageInputBuffer(): Promise<void> {
    // TODO: Verify Merkle tree root
    for (var storageIndex = 0; storageIndex < MAX_MT_LEAVES; storageIndex++) {
      const key = this.cachedOpts.stateManager.registeredKeys![storageIndex]
      const contractAddress = createAddressFromBigInt(this.loadReservedVariableFromBuffer('CONTRACT_ADDRESS').value)
      const valueBytes = await this.cachedOpts.stateManager.getStorage(contractAddress, key)
      this.parent.state.cachedStorage.set(bytesToBigInt(key), {
        index: storageIndex, 
        keyPt: this._addInputBufferWire('MPT_KEY', bytesToBigInt(key), storageIndex, 2),
        valuePt: this._addInputBufferWire('VALUE', bytesToBigInt(valueBytes), storageIndex, 2), 
      })
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
