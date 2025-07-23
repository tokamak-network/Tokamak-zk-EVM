import { ethers, keccak256, solidityPacked } from 'ethers'
import { Block, BlockHeader, HeaderData, createBlock, createBlockHeader } from '@ethereumjs/block'
import { MerkleStateManager } from '@ethereumjs/statemanager'
import { Account, addHexPrefix, Address, bigIntToBytes, bytesToBigInt, bytesToHex, concatBytes, createAccount, createAccountFromRLP, createAddressFromString, hexToBigInt, hexToBytes, PrefixedHexString, setLengthLeft } from '@ethereumjs/util'
import { fetchBlockHeaderFromRPC, pairL1L2Address } from './utils.ts'
import { createLegacyTx, LegacyTx, LegacyTxData } from '@ethereumjs/tx'
import { Common, Hardfork, Mainnet } from '@ethereumjs/common'
import { createVM, runTx, RunTxOpts, RunTxResult } from '@ethereumjs/vm'
import { ZKPSystem } from './ZKPSystem.ts'
import { SignatureSystem } from './signatureSystem.ts'
import { LeanIMT } from '@zk-kit/lean-imt'
import { MT } from './MTManager.ts'

export class MPT {
  public blockNumber: number
  public blockHeaderData: HeaderData
  public contractAddress: Address
  public slots: number[]
  public addrPairsFromL1ToL2: Map<string, Address>
  public addrPairsFromL2toL1: Map<string, Address>
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

  public static async buildFromRPC(
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
    for (const L1Addr in this.addrPairsFromL1ToL2) {
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

  public async simulateTransactionBatch(transactionBatch: LegacyTx[]): Promise<MerkleStateManager[]> {
    const common = new Common({ chain: Mainnet })
      
    const simulatedStateSequence: MerkleStateManager[] = []
    simulatedStateSequence[0] = this._stateTrie.shallowCopy()

    for(const [idx, transaction] of transactionBatch.entries()) {
      const prevStateRoot = await simulatedStateSequence[idx].getStateRoot()
      simulatedStateSequence[idx+1] = simulatedStateSequence[idx].shallowCopy()
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

  public async applyStateUpdate(
    updatedState: MerkleStateManager,
    MTRootSequence: string[],
    signPubKey: string,
    zkpSys: ZKPSystem,
    zkp: string,
  ): Promise<boolean> {
    
    const initialState = structuredClone(this._stateTrie)
    this._stateTrie = structuredClone(updatedState)
    // await this._stateTrie.checkpoint()
    // for (const L1Addr of this._L1Addrs) {
    //   for (const slot of this.slots){
    //     const key = keccak256(solidityPacked(['uint256','uint256'], [L1Addr, slot]))
    //     const keyBytes = hexToBytes(addHexPrefix(key))
    //     const v   = await updatedState.getStorage(this.contractAddress, keyBytes)
    //     this._stateTrie.putStorage(this.contractAddress, keyBytes, v)
    //   }
    // }

    const publicInput = [
      ...await this.serializeStateLeaves(initialState),
      ...await this.serializeStateLeaves(updatedState),
      signPubKey,
      ...MTRootSequence
    ]

    if (!zkpSys.verify(publicInput, zkp)){
      // this._stateTrie.revert()
      return false
    }

    // this._stateTrie.commit()
    // this._stateTrie.flush()
    return true
  }

  private async serializeStateLeaves(state: MerkleStateManager): Promise<string[]> {
    const serialStr: PrefixedHexString[] = []
    for (const L1Addr of this._L1Addrs) {
      for (const slot of this.slots){
        const key = keccak256(solidityPacked(['uint256','uint256'], [L1Addr, slot]))
        const keyBytes = hexToBytes(addHexPrefix(key))
        const v   = await state.getStorage(this.contractAddress, keyBytes)
        serialStr.push(...[addHexPrefix(slot.toString()), addHexPrefix(L1Addr), bytesToHex(v)])        
      }
    }
    return serialStr
  }

  public async getStorage(slot: number, L1Addr: string): Promise<Uint8Array> {
    const key = keccak256(solidityPacked(['uint256','uint256'], [L1Addr, slot]))
    const keyBytes = hexToBytes(addHexPrefix(key))
    return await this._stateTrie.getStorage(this.contractAddress, keyBytes)
  }

  private async addSuperUser(L1Addr: Address, L2Addr: Address): Promise<void> {
    const L1AddrStr = L1Addr.toString()
    if (this.addrPairsFromL1ToL2.has(L1AddrStr)) {
      if ()
    }
  }

  public async createErc20Transfer(prvKey: string, toStr: string, amountStr: string): Promise<LegacyTx> {
    const to = addHexPrefix(toStr)
    if (!this.addrPairsFromL1ToL2.has(to)) {
      throw new Error('invalid "to" address')
    }
    const txData: LegacyTxData = {
          to: this.contractAddress,
          value: 0n,
          data: concatBytes( ...[
              hexToBytes('0xa9059cbb'), 
              setLengthLeft(hexToBytes(addHexPrefix(toStr)), 20), 
              setLengthLeft(hexToBytes(addHexPrefix(amountStr)), 32)
          ])
    }
    const tx = createLegacyTx(txData)
    const formattedPrvKey = setLengthLeft(hexToBytes(addHexPrefix(prvKey)), 32)
    tx.sign(formattedPrvKey)
    const senderAddr = tx.getSenderAddress()
    if (!this.addrPairsFromL1ToL2.has(senderAddr.toString())) {
      this.addrPairsFromL1ToL2.set(senderAddr.toString(), senderAddr)
      this.addrPairsFromL2toL1.set(senderAddr.toString(), senderAddr)
    } 
    const balanceKey = keccak256(solidityPacked(['uint256','uint256'], [senderAddr.toString(), this.balanceSlot]))
    const keyBytes = hexToBytes(addHexPrefix(balanceKey))
    const val = await this._stateTrie.getStorage(this.contractAddress, keyBytes)
    if (hexToBigInt(addHexPrefix(amountStr)) < bytesToBigInt(val)) {
      const newVal = bigIntToBytes(bytesToBigInt(val) + hexToBigInt(addHexPrefix(amountStr)))
      await this._stateTrie.putStorage(this.contractAddress, keyBytes, newVal)
    }
    return tx
  }

}