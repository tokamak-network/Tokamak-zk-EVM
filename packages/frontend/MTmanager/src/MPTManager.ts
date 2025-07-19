import { ethers, keccak256, solidityPacked } from 'ethers'
import { Block, BlockHeader, HeaderData, createBlock, createBlockHeader } from '@ethereumjs/block'
import { MerkleStateManager } from '@ethereumjs/statemanager'
import { Account, addHexPrefix, Address, bytesToBigInt, createAccount, createAccountFromRLP, createAddressFromString, hexToBytes } from '@ethereumjs/util'
import { fetchBlockHeaderFromRPC, pairL1L2Address } from './utils.ts'
import { LegacyTx } from '@ethereumjs/tx'
import { Common, Hardfork, Mainnet } from '@ethereumjs/common'
import { createVM, runTx, RunTxOpts, RunTxResult } from '@ethereumjs/vm'
import { ZKPSystem } from './ZKPSystem.ts'

const StateFinalizeResult = {
  InvalidPublicInput: 'Mismatch between updated state and public root',
  InvalidPublicOutput: 'Mismatch between finalized state and public root',
  InvalidZKP: 'Invalid ZKP',
  Success: 'Successful state update'
} as const
export type StateFinalizeResult = (typeof StateFinalizeResult)[keyof typeof StateFinalizeResult]

const rpcUrl = 'https://eth-mainnet.g.alchemy.com/v2/e_QJd40sb7aiObJisG_8Q'

// export type RawLeavesByL1Addr = Record<string, bigint>
// export type L1DataBaseBySlot = Record<number, RawLeavesByL1Addr>

export class MPT {
  public blockNumber: number
  public blockHeaderData: HeaderData
  public contractAddress: Address
  public slots: number[]
  public addrPairsFromL1ToL2: Map<Address, Address>
  public addrPairsFromL2toL1: Map<Address, Address>
  private _stateTrie = new MerkleStateManager()
  private _L1Addrs: string[]
  private _isFetched: boolean

  constructor(
    blockNumber: number,
    contractAddress: string,
    slots: number[],
    L1Addrs: string[],
    L2Addrs: string[],
  ){
    this._isFetched = false
    this.blockNumber = blockNumber
    this.blockHeaderData = {}
    this.contractAddress = createAddressFromString(addHexPrefix(contractAddress))
    this.slots = [...slots]
    this._L1Addrs = [...L1Addrs]
    const addrPairs = pairL1L2Address(L1Addrs, L2Addrs)
    this.addrPairsFromL1ToL2 = addrPairs.addrPairFromL1ToL2
    this.addrPairsFromL2toL1 = addrPairs.addrPairFromL2ToL1
  }

  public static async init(
    blockNumber: number,
    contractAddress: string,
    slots: number[],
    L1Addrs: string[],
    L2Addrs: string[],
    rpcUrl: string,
  ) {
    const mpt = new MPT(blockNumber, contractAddress, slots, L1Addrs, L2Addrs)
    mpt.blockHeaderData =  await fetchBlockHeaderFromRPC(mpt.blockNumber, rpcUrl)
    await mpt.fetchContractStateFromRPC(rpcUrl)
    return mpt
  }

  private async fetchContractStateFromRPC (rpcUrl: string) {
    if (this._isFetched) {
      throw new Error('The MPT is already initialized.')
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contractAccount = createAccount({})
    this._stateTrie.putAccount(this.contractAddress, contractAccount)
    const byteCodeStr = await provider.getCode(this.contractAddress.toString(), this.blockNumber)
    this._stateTrie.putCode(this.contractAddress, hexToBytes(addHexPrefix(byteCodeStr)))
    for (const L1Addr of this._L1Addrs) {
      for (const slot of this.slots){
        const key = keccak256(solidityPacked(['uint256','uint256'], [L1Addr, slot]))
        const keyBytes = hexToBytes(addHexPrefix(key))
        const v   = await provider.getStorage(this.contractAddress.toString(), key, this.blockNumber)
        const vBytes = hexToBytes(addHexPrefix(v))
        this._stateTrie.putStorage(this.contractAddress, keyBytes, vBytes)
      }
    }
    this._isFetched = true
  }

  public async simulateTransactions(transactionBatch: LegacyTx[]): Promise<MerkleStateManager[]> {
    const common = new Common({ chain: Mainnet, hardfork: Hardfork.Shanghai })
      
    const simulatedStateSequence: MerkleStateManager[] = []
    simulatedStateSequence[0] = this._stateTrie.shallowCopy(false)

    for(const [idx, transaction] of transactionBatch.entries()) {
      const prevStateRoot = await simulatedStateSequence[idx].getStateRoot()
      simulatedStateSequence[idx+1] = simulatedStateSequence[idx].shallowCopy(false)
      const vm = await createVM({ common, stateManager: simulatedStateSequence[idx+1] });

      const runTxOpts: RunTxOpts = {
        tx: transaction,
        skipBalance: true,
        skipNonce: true,
        skipBlockGasLimitValidation: true,
        reportPreimages: true,
        block: createBlock({header: this.blockHeaderData})
      }
      const runTxResult = await runTx(vm, runTxOpts)
      const resultState = runTxResult.execResult.runState?.stateManager
      if (runTxResult.execResult.exceptionError !== undefined || resultState === undefined) {
        throw new Error('Some error happened during runTx')
      }
      const newStateRoot = await simulatedStateSequence[idx+1].getStateRoot()
      if ( prevStateRoot === newStateRoot ) {
        throw new Error('Some error happened during runTx')
      }
    }
    return simulatedStateSequence
  }

  public async finalizeStateUpdate(
    updatedState: MerkleStateManager,
    rootSequence: bigint[],
    zkpSys: ZKPSystem,
    zkp: string,
    signSys: 

  ): Promise<StateFinalizeResult> {
    
    await this._stateTrie.checkpoint()
    for (const L1Addr of this._L1Addrs) {
      for (const slot of this.slots){
        const key = keccak256(solidityPacked(['uint256','uint256'], [L1Addr, slot]))
        const keyBytes = hexToBytes(addHexPrefix(key))
        const v   = await updatedState.getStorage(this.contractAddress, keyBytes)
        this._stateTrie.putStorage(this.contractAddress, keyBytes, v)
      }
    }

    if (!zkpSys.verify(rootSequence, zkp)){
      this._stateTrie.revert()
      return StateFinalizeResult.InvalidZKP
    }

    const updatedRoot = await updatedState.getStateRoot()
    if ( bytesToBigInt(updatedRoot) !== rootSequence.at(-1)) {
      this._stateTrie.revert()
      return StateFinalizeResult.InvalidPublicInput
    }

    const finalizedRoot = await updatedState.getStateRoot()
    if (rootSequence.at(-1) !== bytesToBigInt(finalizedRoot)) {
      this._stateTrie.revert()
      return StateFinalizeResult.InvalidPublicOutput
    }

    this._stateTrie.commit()
    this._stateTrie.flush()
    return StateFinalizeResult.Success
  }
}