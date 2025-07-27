import { ethers, keccak256, solidityPacked } from 'ethers'
import { Block, BlockHeader, HeaderData, createBlock, createBlockHeader } from '@ethereumjs/block'
import { MerkleStateManager } from '@ethereumjs/statemanager'
import { Account, addHexPrefix, Address, bigIntToBytes, bigIntToHex, bytesToBigInt, bytesToHex, concatBytes, createAccount, createAccountFromRLP, createAddressFromString, hexToBigInt, hexToBytes, PrefixedHexString, setLengthLeft } from '@ethereumjs/util'
import { fetchBlockHeaderFromRPC, getStorageKey } from './utils.ts'
import { createLegacyTx, LegacyTx, LegacyTxData } from '@ethereumjs/tx'
import { Common, Hardfork, Mainnet } from '@ethereumjs/common'
import { createVM, runTx, RunTxOpts, RunTxResult } from '@ethereumjs/vm'
import { ZKPSystem } from './ZKPSystem.ts'
import { L2SignatureSystem } from './signatureSystem.ts'
import { LeanIMT } from '@zk-kit/lean-imt'
import { MT } from './MTManager.ts'
import { L1Address, L2Address } from './types.ts'

export class MPT {
  public blockNumber: number
  public blockHeaderData: HeaderData
  public contractAddress: L1Address
  public contractSlots: number[]
  public userSlots: number[]
  public addrPairsFromL1ToL2: Map<string, L2Address>
  public addrPairsFromL2toL1: Map<string, L1Address>
  public L2Signature: L2SignatureSystem
  private _stateTrie = new MerkleStateManager()
  private _isFetched: boolean
  private _userL2PubKeys: Uint8Array[]

  constructor(
    blockNumber: number,
    contractAddress: string,
    contractSlots: number[],
    userSlots: number[],
    L1Addrs: string[],
    userL2PubKeys: Uint8Array[],
  ){
    this._isFetched = false
    this.blockNumber = blockNumber
    this.blockHeaderData = {}
    this.contractAddress = createAddressFromString(addHexPrefix(contractAddress))
    this.contractSlots = [...contractSlots]
    this.userSlots = [...userSlots]
    this._userL2PubKeys = userL2PubKeys
    this.L2Signature = L2SignatureSystem.keyGen('sys prv key')
    const addrPairs = this.pairL1L2Address(L1Addrs, userL2PubKeys)
    this.addrPairsFromL1ToL2 = addrPairs.addrPairFromL1ToL2
    this.addrPairsFromL2toL1 = addrPairs.addrPairFromL2ToL1
  }

  public static async buildFromRPC(
    blockNumber: number,
    contractAddress: string,
    contractSlots: number[],
    userSlots: number[],
    L1Addrs: string[],
    userL2PubKeys: Uint8Array[],
    rpcUrl: string,
  ) {
    const mpt = new MPT(blockNumber, contractAddress, contractSlots, userSlots, L1Addrs, userL2PubKeys)
    mpt.blockHeaderData =  await fetchBlockHeaderFromRPC(mpt.blockNumber, rpcUrl)
    await mpt.fetchContractStateFromRPC(rpcUrl)
    return mpt
  }

  public shallowCopy(): MPT {
    const l1Arr = [...this.addrPairsFromL1ToL2.keys()]
    const userL2PubKeys = [...this._userL2PubKeys]

    const cloned = new MPT(
      this.blockNumber,
      this.contractAddress.toString(),
      [...this.contractSlots],
      [...this.userSlots],
      l1Arr,
      userL2PubKeys
    )

    cloned.blockHeaderData = { ...this.blockHeaderData }

    cloned._stateTrie = this._stateTrie.shallowCopy()
    cloned._isFetched = this._isFetched

    return cloned
  }

  private pairL1L2Address(L1Addrs: string[], userL2PubKeys: Uint8Array[]): {
    addrPairFromL1ToL2: Map<string, Address>, 
    addrPairFromL2ToL1: Map<string, Address>
  } {
    const strToAddr = (addrStr: string): L1Address | L2Address => {
      return createAddressFromString(addHexPrefix(addrStr))
    }
    const fromL1ToL2 = new Map<string, L2Address>()
    const fromL2ToL1 = new Map<string, L1Address>()
    if (!this.checkAddressDuplication(L1Addrs)) {
      throw new Error("Address duplication or length mismatch.")
    }
    for (const [idx, L1Addr] of L1Addrs.entries()) {
      const userL2PubKey = userL2PubKeys[idx]
      this._userL2PubKeys[idx] = userL2PubKey
      const L2Addr = this.L2Signature.createAddressFromPublicKey(userL2PubKey)
      fromL1ToL2.set(L1Addr, L2Addr)
      fromL2ToL1.set(L2Addr.toString(), strToAddr(L1Addr))
    }
    return {
        addrPairFromL1ToL2: fromL1ToL2,
        addrPairFromL2ToL1: fromL2ToL1,
    }
  }

  private checkAddressDuplication(L1Addrs: string[]): boolean {
    const L1AddrSet = new Set(L1Addrs);
    if (L1AddrSet.size !== L1Addrs.length) return false
    const L2AddrSet = new Set(this._userL2PubKeys.map(val => bytesToHex(val)))
    if (L2AddrSet.size !== this._userL2PubKeys.length) return false
    if (L1Addrs.length !== this._userL2PubKeys.length) return false
    return true;
  }

  private async fetchContractStateFromRPC (rpcUrl: string) {
    if (this._isFetched) {
      throw new Error('The MPT is already initialized.')
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contractAccount = createAccount({})
    await this._stateTrie.putAccount(this.contractAddress, contractAccount)
    const byteCodeStr = await provider.getCode(this.contractAddress.toString(), this.blockNumber)
    await this._stateTrie.putCode(this.contractAddress, hexToBytes(addHexPrefix(byteCodeStr)))
    // await this._stateTrie.checkpoint()
    for (const L1Addr of this.addrPairsFromL1ToL2.keys()) {
      for (const slot of this.userSlots){
        const key = getStorageKey([L1Addr, slot])
        const v   = await provider.getStorage(this.contractAddress.toString(), bytesToBigInt(key), this.blockNumber)
        const vBytes = hexToBytes(addHexPrefix(v))
        await this._stateTrie.putStorage(this.contractAddress, key, vBytes)
      }
    }
    for (const slot of this.contractSlots) {
      const key = getStorageKey([slot])
      const v   = await provider.getStorage(this.contractAddress.toString(), bytesToBigInt(key), this.blockNumber)
      const vBytes = hexToBytes(addHexPrefix(v))
      await this._stateTrie.putStorage(this.contractAddress, key, vBytes)
    }

    // await this._stateTrie.commit()
    // await this._stateTrie.flush()
    this._isFetched = true
  }

  public async simulateTransactionBatch(transactionBatch: LegacyTx[]): Promise<MPT[]> {
    const common = new Common({ chain: Mainnet })
      
    const simulatedStateSequence: MPT[] = []
    simulatedStateSequence[0] = this.shallowCopy()

    for(const [idx, transaction] of transactionBatch.entries()) {
      const prevStateRoot = await simulatedStateSequence[idx]._stateTrie.getStateRoot()
      simulatedStateSequence[idx+1] = simulatedStateSequence[idx].shallowCopy()

      // let log
      // console.log(`amount: ${hexToBigInt('0xce1e1ff314be3c0000')}`)
      // log = await this._stateTrie.getStorage(this.contractAddress, getStorageKey([transaction.getSenderAddress().toString(), 0]))
      // console.log(`prev:sender:${bytesToBigInt(log)}`)
      // log = await this._stateTrie.getStorage(this.contractAddress, getStorageKey([transaction.to!.toString(), 0]))
      // console.log(`prev:receiver:${bytesToBigInt(log)}`)

      const vm = await createVM({ common, stateManager: simulatedStateSequence[idx+1]._stateTrie });
      // vm.evm.events!.on('step', ({ opcode, pc, gasLeft, stack }) => {
      //   console.log(pc, opcode.name, gasLeft, stack.toString())
      // })

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
      const newStateRoot = await simulatedStateSequence[idx+1]._stateTrie.getStateRoot()
      if ( prevStateRoot === newStateRoot ) {
        throw new Error('Some error happened during runTx')
      }
      // log = await resultState.getStorage(this.contractAddress, getStorageKey([transaction.getSenderAddress().toString(), 0]))
      // console.log(`after:sender:${bytesToBigInt(log)}`)
      // log = await resultState.getStorage(this.contractAddress, getStorageKey([transaction.to!.toString(), 0]))
      // console.log(`after:receiver:${bytesToBigInt(log)}`)
    }
    return simulatedStateSequence
  }

  public async applyStateUpdate(
    updatedState: MPT,
    MTRootSequence: string[],
    signPubKey: string,
    zkpSys: ZKPSystem,
    zkp: string,
  ): Promise<boolean> {
    
    const initialState = structuredClone(this)
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
      ...await initialState.serializeUserStorageLeaves(),
      ...await updatedState.serializeUserStorageLeaves(),
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

  public async serializeUserStorageLeaves(): Promise<string[]> {
    const serialStr: PrefixedHexString[] = []
    for (const L1Addr of this.addrPairsFromL1ToL2.keys()) {
      for (const slot of this.userSlots){
        const key = getStorageKey([L1Addr, slot])
        const v   = await this._stateTrie.getStorage(this.contractAddress, key)
        serialStr.push(...[bytesToHex(key), addHexPrefix(slot.toString()), addHexPrefix(L1Addr), bytesToHex(v)])        
      }
    }
    return serialStr
  }
  public async serializeContractStorageLeaves(): Promise<string[]> {
    const serialStr: PrefixedHexString[] = []
    for (const slot of this.contractSlots){
      const key = getStorageKey([slot])
      const v   = await this._stateTrie.getStorage(this.contractAddress, key)
      serialStr.push(...[addHexPrefix(slot.toString()), bytesToHex(v)])        
    }
    return serialStr
  }

  public async getStorage(slot: number, L1Addr?: string | undefined): Promise<Uint8Array> {
    let key
    if (L1Addr === undefined) {
      key = getStorageKey([slot])
    } else {
      key = getStorageKey([L1Addr, slot])
    }
    return await this._stateTrie.getStorage(this.contractAddress, key)
  }

  public async createErc20Transfers(prvKey: Uint8Array, toStrs: string[], amounts: bigint[], balanceSlot: number): Promise<LegacyTx[]> {
    if (toStrs.length !== amounts.length){
      throw new Error('Mismatch between the numbers of to addresses and amounts')
    }
    const txBatch: LegacyTx[] = []
    for (const [idx, toStr] of toStrs.entries()){
      const to = addHexPrefix(toStr)
      const amountStr = bigIntToHex(amounts[idx])
      if (!this.addrPairsFromL1ToL2.has(to)) {
        throw new Error('invalid "to" address')
      }
      const txData: LegacyTxData = {
            to: this.contractAddress,
            value: 0n,
            data: concatBytes( ...[
                hexToBytes('0xa9059cbb'), 
                setLengthLeft(hexToBytes(addHexPrefix(toStr)), 32), 
                setLengthLeft(hexToBytes(addHexPrefix(amountStr)), 32)
            ]),
            gasLimit: 999999n,
            gasPrice: 4936957717n,
      }
      const tx = createLegacyTx(txData)
      const signedTx = tx.sign(prvKey)
      const senderL1Addr: L1Address = signedTx.getSenderAddress()
      const senderL2PubKey = this.L2Signature.privateToPublic(prvKey)
      const senderL2Addr: L2Address = this.L2Signature.createAddressFromPublicKey(senderL2PubKey)
      if (!this.addrPairsFromL1ToL2.has(senderL1Addr.toString())) {
        this.addrPairsFromL1ToL2.set(senderL1Addr.toString(), senderL2Addr)
        this.addrPairsFromL2toL1.set(senderL2Addr.toString(), senderL1Addr)
        this._userL2PubKeys.push(senderL2PubKey)
      }
      //// This part add sufficient balance to the sender. Must be removed in the future
      const key = getStorageKey([senderL1Addr.toString(), balanceSlot])
      const val = await this._stateTrie.getStorage(this.contractAddress, key)
      if (hexToBigInt(addHexPrefix(amountStr)) > bytesToBigInt(val)) {
        const newVal = bigIntToBytes(bytesToBigInt(val) + 10n * hexToBigInt(addHexPrefix(amountStr)))
        await this._stateTrie.putStorage(this.contractAddress, key, newVal)
      }
      ////
      txBatch.push(signedTx)
    }
    
    return txBatch
  }
}