import { NUMBER_OF_PREV_BLOCK_HASHES, POSEIDON_INPUTS, SUBCIRCUIT_BUFFER_MAPPING } from 'src/interface/qapCompiler/importedConstants.ts';
import { addHexPrefix, bigIntToBytes, bytesToBigInt, createAddressFromBigInt, hexToBigInt, PrefixedHexString, toBytes } from '@ethereumjs/util';
import { jubjub } from '@noble/curves/jubjub';
import { DataPt, DataPtDescription, ISynthesizerProvider, PlacementEntry, ReservedVariable, SynthesizerOpts, VARIABLE_DESCRIPTION } from '../types/index.ts';
import { DataPtFactory } from '../dataStructure/index.ts';
import { BUFFER_DESCRIPTION, BUFFER_LIST } from 'src/interface/qapCompiler/configuredTypes.ts';
import { DEFAULT_SOURCE_BIT_SIZE } from '../params/index.ts';

export class BufferManager {
  private parent: ISynthesizerProvider
  private cachedOpts: SynthesizerOpts

  constructor(
    parent: ISynthesizerProvider,
  ) {
    this.parent = parent
    this.cachedOpts = parent.cachedOpts
    this._initBuffers()
  }

  // public addWireToOutBuffer(
  //   outPt: DataPt,
  //   placementId: number,
  // ): void {
  //   // Use the length of existing output list as index for new output
  //   if (
  //     this.parent.placements.get(placementId)!.inPts.length !==
  //       this.parent.placements.get(placementId)!.outPts.length
  //     ) {
  //     throw new Error(
  //       `Synthesizer: Mismatches in the buffer wires (placement id: ${placementId})`,
  //     );
  //   }
  //   const inWireIndex = 
  //   const inPtRaw: DataPtDescription = {
  //     source: placementId,
  //     wireIndex: inWireIndex,
  //     sourceBitSize: inPt.sourceBitSize,
  //   }
  //   let outPtIdx = this.parent.placements.get(placementId)!.outPts.length;
  //   if (outPt.wireIndex !== outPtIdx) {
  //     throw new Error(
  //       `Synthesizer: Invalid indexing in the output wire of an output buffer (placement id: ${placementId}, wire id: ${outPtIdx})`,
  //     );
  //   }
  //   // Add input-output pair to the output buffer subcircuit
  //   this.parent.placements.get(placementId)!.inPts.push(inPt);
  //   this.parent.placements.get(placementId)!.outPts.push(outPt);
  // }

  public addReservedVariableToBufferIn(varName: ReservedVariable, value: bigint = 0n, dynamic: boolean = false, message?: string): DataPt {
    const placementIndex = VARIABLE_DESCRIPTION[varName].source
    const wireDesc: DataPtDescription = {...VARIABLE_DESCRIPTION[varName], extSource: VARIABLE_DESCRIPTION[varName].extSource + (message ?? '')}
    const externalDataPt = DataPtFactory.create(wireDesc, value)
    if (dynamic) {
      if (wireDesc.wireIndex !== -1) {
        throw new Error('This variable is static')
      }
      externalDataPt.wireIndex = this.parent.placements[placementIndex]!.inPts.length
    }
    const symbolDataPt = DataPtFactory.createBufferTwin(externalDataPt)
    return DataPtFactory.deepCopy(this.parent.addWirePairToBufferIn(externalDataPt, symbolDataPt, dynamic))
  }

  public addReservedVariableToBufferOut(varName: ReservedVariable, symbolDataPt: DataPt, dynamic: boolean = false, message?: string): DataPt {
    const placementIndex = VARIABLE_DESCRIPTION[varName].source
    const wireDesc: DataPtDescription = {...VARIABLE_DESCRIPTION[varName], extDest: VARIABLE_DESCRIPTION[varName].extDest + (message ?? '')}
    const externalDataPt = DataPtFactory.create(wireDesc, symbolDataPt.value)
    if (dynamic) {
      if (wireDesc.wireIndex !== -1) {
        throw new Error('This variable is static')
      }
      externalDataPt.wireIndex = this.parent.placements[placementIndex]!.inPts.length
    } 
    return DataPtFactory.deepCopy(this.parent.addWirePairToBufferIn(symbolDataPt, externalDataPt, dynamic))
  }

  public loadArbitraryStatic(
    value: bigint,
    bitSize?: number,
    desc?: string,
  ): DataPt {
    if (desc === undefined) {
      const cachedDataPt = this.parent.state.cachedEVMIn.get(value)
      if (cachedDataPt !== undefined) {
        return DataPtFactory.deepCopy(cachedDataPt)
      }
    }
    const placementIndex = BUFFER_LIST.findIndex(str => str === 'EVM_IN')
    const inPtRaw: DataPtDescription = {
      extSource: desc ?? 'Arbitrary constant',
      sourceBitSize: bitSize ?? DEFAULT_SOURCE_BIT_SIZE,
      source: placementIndex,
      wireIndex: this.parent.placements[placementIndex]!.inPts.length,
    };
    const inPt = DataPtFactory.create(inPtRaw, value)
    const outPt = DataPtFactory.createBufferTwin(inPt)
    this.parent.addWirePairToBufferIn(inPt, outPt, true)
    this.parent.state.cachedEVMIn.set(value, outPt)
    return DataPtFactory.deepCopy(outPt)
  }

  /**
   * Initializes the default placements for public/private inputs and outputs.
   */
  private _initBuffers(): void {
    // const _addUnusedBufferWire = (buffer: ReservedBuffer): void => {
    //   const placementIndex = BUFFER_PLACEMENT[buffer].placementIndex
    //   const placement = this.parent.placements[placementIndex]!
    //   const inPtDesc: DataPtDescription = {
    //     source: placementIndex,
    //     sourceBitSize: 1,
    //     wireIndex: placement.inPts.length
    //   }
    //   const {inPt, outPt} = DataPtFactory.createInputBufferWirePair(inPtDesc, 0n)
    //   if (outPt.wireIndex !== placement.outPts.length || inPt.wireIndex !== outPt.wireIndex) {
    //     throw new Error(`Wire index mismatch while initializing buffers`)
    //   }
    //   this.parent.placements[placementIndex]!.inPts.push(inPt)
    //   this.parent.placements[placementIndex]!.outPts.push(outPt)
    // }

    for (const buffer of BUFFER_LIST) {
      const subcircuit = SUBCIRCUIT_BUFFER_MAPPING[buffer];
      if (subcircuit === undefined) {
        throw new Error(
          `Could not find subcircuit info for placement '${buffer}'`,
        )
      }
      this.parent.place(
        subcircuit.name,
        new Array<DataPt>(0),
        new Array<DataPt>(0),
        BUFFER_DESCRIPTION[buffer],
      )
    }
    

    // Static public inputs
    this.addReservedVariableToBufferIn('INI_MERKLE_ROOT', BigInt(this.cachedOpts.stateManager.initialMerkleTree.root))
    this.addReservedVariableToBufferIn('RES_MERKLE_ROOT', BigInt(this.cachedOpts.stateManager.initialMerkleTree.root))

    this.addReservedVariableToBufferIn('CIRCOM_CONST_ONE', 1n)
    this.addReservedVariableToBufferIn('CIRCOM_CONST_ZERO', 0n)
    this.addReservedVariableToBufferIn('ADDRESS_MASK', (1n << 160n) - 1n)
    this.addReservedVariableToBufferIn('JUBJUB_BASE_X', jubjub.Point.BASE.toAffine().x)
    this.addReservedVariableToBufferIn('JUBJUB_BASE_Y', jubjub.Point.BASE.toAffine().y)
    this.addReservedVariableToBufferIn('JUBJUB_POI_X', jubjub.Point.ZERO.toAffine().x)
    this.addReservedVariableToBufferIn('JUBJUB_POI_Y', jubjub.Point.ZERO.toAffine().y)
    // const nullPoseidonL0 = poseidon_raw(Array(POSEIDON_INPUTS).fill(0n))
    // this.addReservedVariableToBufferIn('NULL_POSEIDON_LEVEL0', nullPoseidonL0)
    // const nullPoseidonL1 = poseidon_raw(Array(POSEIDON_INPUTS).fill(nullPoseidonL0))
    // this.addReservedVariableToBufferIn('NULL_POSEIDON_LEVEL1', nullPoseidonL1)
    // const nullPoseidonL2 = poseidon_raw(Array(POSEIDON_INPUTS).fill(nullPoseidonL1))
    // this.addReservedVariableToBufferIn('NULL_POSEIDON_LEVEL2', nullPoseidonL2)
    // const nullPoseidonL3 = poseidon_raw(Array(POSEIDON_INPUTS).fill(nullPoseidonL2))
    // this.addReservedVariableToBufferIn('NULL_POSEIDON_LEVEL3', nullPoseidonL3)

    this.addReservedVariableToBufferIn('COINBASE', this.cachedOpts.blockInfo.coinBase)
    this.addReservedVariableToBufferIn('TIMESTAMP', this.cachedOpts.blockInfo.timeStamp)
    this.addReservedVariableToBufferIn('NUMBER', this.cachedOpts.blockInfo.blockNumber)
    this.addReservedVariableToBufferIn('PREVRANDAO', this.cachedOpts.blockInfo.prevRanDao)
    this.addReservedVariableToBufferIn('GASLIMIT', this.cachedOpts.blockInfo.gasLimit)
    this.addReservedVariableToBufferIn('CHAINID', this.cachedOpts.blockInfo.chainId)
    this.addReservedVariableToBufferIn('SELFBALANCE', this.cachedOpts.blockInfo.selfBalance)
    this.addReservedVariableToBufferIn('BASEFEE', this.cachedOpts.blockInfo.baseFee)
    for (var i = 1; i <= NUMBER_OF_PREV_BLOCK_HASHES; i++) {
      this.addReservedVariableToBufferIn(`BLOCKHASH_${i}` as ReservedVariable, this.cachedOpts.blockInfo.blockHashes[i-1])
    }

    // Transaction inputs
    this._initTransactionBuffer()

    // Check if omitted buffer wires
    for (const [placementIndex, buffer] of BUFFER_LIST.entries()) {
      const actualNumberInWires = this.parent.placements[placementIndex]!.inPts.filter(wire => wire !== undefined).length
      const actualNumberOutWires = this.parent.placements[placementIndex]!.outPts.filter(wire => wire !== undefined).length
      if ( 
        actualNumberInWires -1 !== (this.parent.placements[placementIndex]!.inPts.at(-1)?.wireIndex ?? -1) ||
        actualNumberOutWires -1 !== (this.parent.placements[placementIndex]!.outPts.at(-1)?.wireIndex ?? -1)
      ) {
        throw new Error('Some wires are omitted while initializing buffers')
      }
      if ( actualNumberInWires !== actualNumberOutWires ) {
        throw new Error(`Input and output wires mismatch in ${buffer} buffer`)
      }
    }
  }

  private _initTransactionBuffer(): void {
    const l2Tx = this.cachedOpts.signedTransaction
    const senderPublicKey = l2Tx.getUnsafeEddsaPubKey()
    const randomizer = l2Tx.r === undefined ? undefined : l2Tx.getUnsafeEddsaRandomizer()
    this.addReservedVariableToBufferIn('EDDSA_PUBLIC_KEY_X', senderPublicKey.toAffine().x)
    this.addReservedVariableToBufferIn('EDDSA_PUBLIC_KEY_Y', senderPublicKey.toAffine().y)
    this.addReservedVariableToBufferIn('EDDSA_RANDOMIZER_X', randomizer?.toAffine().x)
    this.addReservedVariableToBufferIn('EDDSA_RANDOMIZER_Y', randomizer?.toAffine().y)
    this.addReservedVariableToBufferIn('EDDSA_SIGNATURE', l2Tx.s)
    this.addReservedVariableToBufferIn('CONTRACT_ADDRESS', bytesToBigInt(toBytes(l2Tx.to)))
    this.addReservedVariableToBufferIn('FUNCTION_SELECTOR', bytesToBigInt(l2Tx.getFunctionSelector()))
    this.addReservedVariableToBufferIn('TRANSACTION_NONCE', l2Tx.nonce)
    for (var inputIndex = 0; inputIndex < 9; inputIndex ++) {
      this.addReservedVariableToBufferIn(
        `TRANSACTION_INPUT${inputIndex}` as ReservedVariable, 
        bytesToBigInt(l2Tx.getFunctionInput(inputIndex)),
      )
    }
  }

  // private async _initStorageInputBuffer(): Promise<void> {
  //   // TODO: Verify Merkle tree root
  //   for (var storageIndex = 0; storageIndex < MAX_MT_LEAVES; storageIndex++) {
  //     const key = this.cachedOpts.stateManager.registeredKeys![storageIndex]
  //     const contractAddress = createAddressFromBigInt(this.loadReservedVariableFromBuffer('CONTRACT_ADDRESS').value)
  //     const valueBytes = await this.cachedOpts.stateManager.getStorage(contractAddress, key)
  //     this.parent.state.cachedStorage.set(bytesToBigInt(key), {
  //       index: storageIndex, 
  //       keyPt: this.addReservedVariableToBufferIn('MPT_KEY', bytesToBigInt(key), storageIndex, 2),
  //       valuePt: this.addReservedVariableToBufferIn('VALUE', bytesToBigInt(valueBytes), storageIndex, 2), 
  //     })
  //   }
  // }
  
  public getReservedVariableFromBuffer(varName: ReservedVariable): DataPt {
    if (VARIABLE_DESCRIPTION[varName].extSource === undefined) {
      throw new Error('Usable only for reserved variables of input buffers')
    }
    const placementIndex = VARIABLE_DESCRIPTION[varName].source
    const wireIndex: number = VARIABLE_DESCRIPTION[varName].wireIndex
    // switch (varName) {
    //   case 'EDDSA_SIGNATURE':
    //   case 'EDDSA_RANDOMIZER_X':
    //   case 'EDDSA_RANDOMIZER_Y':
    //     if (txNonce === undefined) {
    //       throw new Error('Reading transaction related variables requires transaction nonce')
    //     }
    //     wireIndex += txNonce * 3
    //     break
    //   case 'TRANSACTION_NONCE':
    //   case 'CONTRACT_ADDRESS':
    //   case 'FUNCTION_SELECTOR':
    //   case 'TRANSACTION_INPUT0':
    //   case 'TRANSACTION_INPUT1':
    //   case 'TRANSACTION_INPUT2':
    //   case 'TRANSACTION_INPUT3':
    //   case 'TRANSACTION_INPUT4':
    //   case 'TRANSACTION_INPUT5':
    //   case 'TRANSACTION_INPUT6':
    //   case 'TRANSACTION_INPUT7':
    //   case 'TRANSACTION_INPUT8':
    //     if (txNonce === undefined) {
    //       throw new Error('Reading transaction related variables requires transaction nonce')
    //     }
    //     wireIndex += txNonce * 12
    //     break
    //   default:
    //     break
    // }

    const outPt = this.parent.placements[placementIndex]!.outPts[wireIndex]
    if (outPt.wireIndex !== wireIndex || outPt.source !== placementIndex) {
      throw new Error('Invalid wire information')
    }
    return DataPtFactory.deepCopy(outPt)
  }
}



