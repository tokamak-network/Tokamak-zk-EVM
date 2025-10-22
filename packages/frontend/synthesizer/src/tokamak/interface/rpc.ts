import { Common, CommonOpts, Sepolia } from "@ethereumjs/common"
import { createTokamakL2StateManagerFromL1RPC, createTokamakL2Tx, getEddsaPublicKey, poseidon, TokamakL2StateManagerOpts, TokamakL2TxData } from "../TokamakL2JS/index.ts"
import { RPCStateManager } from "@ethereumjs/statemanager"
import { addHexPrefix, createAddressFromString, hexToBigInt } from "@ethereumjs/util"
import { SynthesizerBlockInfo, SynthesizerOpts } from "../types/synthesizer.ts"
import { ethers } from "ethers"

type SynthesizerSimulationOpts = {
  rpcUrl: string,
  blockNumber: number,
  contractAddress: `0x${string}`,
  addressListL1: `0x${string}`[],
  addressListL2: `0x${string}`[],
  senderL2PrvKey: Uint8Array,
  userStorageSlots: number[],
  callData: Uint8Array,
}


async function getBlockInfoFromRPC(
	rpcUrl: string,
	blockNumber: number,
	nHashes: number,
): Promise<SynthesizerBlockInfo> {
	const provider = new ethers.JsonRpcProvider(rpcUrl)
	const block = await provider.getBlock(blockNumber, false)
	
	if (block === null) {
		throw new Error('RPC calls an invalid block')
	}

	async function _getBlockHashFromProvider(
		provider: ethers.JsonRpcProvider,
		blockNumber: number,
	): Promise<string> {
		const block = await provider.getBlock(blockNumber, false)
		return block?.hash ?? '0x00'
	}	

	const hashes: bigint[] = new Array<bigint>(nHashes)
	for ( var i = 0; i < nHashes; i++){
		const prevBlockNumber = blockNumber - i
		hashes[i] = hexToBigInt(addHexPrefix(await _getBlockHashFromProvider(provider, prevBlockNumber)))
	}

	return {
		coinBase: BigInt(addHexPrefix(block.miner!)),
		timeStamp: BigInt(block.timestamp),
		blockNumber: BigInt(block.number),
		prevRanDao: block.prevRandao == null ? BigInt(block.difficulty) : BigInt(block.prevRandao),
		gasLimit: BigInt(block.gasLimit),
		chainId: (await provider.getNetwork()).chainId,
		selfBalance: 0n,
		baseFee: BigInt(block.baseFeePerGas || '0x0'),
		blockHashes: hashes,
	}
}

export async function createSynthesizerOptsForSimulationFromRPC(opts: SynthesizerSimulationOpts): Promise<SynthesizerOpts> {
    if (typeof opts.rpcUrl !== 'string' || !opts.rpcUrl.startsWith('http')) {
      throw new Error(`valid RPC provider url required; got ${opts.rpcUrl}`)
    }
    const blockInfo = await getBlockInfoFromRPC(opts.rpcUrl, opts.blockNumber, 1)

    const commonOpts: CommonOpts = {
        chain: {
        ...Sepolia, 
        chainId: Number(blockInfo.chainId)
        },
        customCrypto: { keccak256: poseidon, ecrecover: getEddsaPublicKey }
    }
    const common = new Common(commonOpts)

    const stateManagerOpts: TokamakL2StateManagerOpts = {
        common,
        blockNumber: opts.blockNumber,
        contractAddress: opts.contractAddress,
        userStorageSlots: opts.userStorageSlots,
        userL1Addresses: opts.addressListL1,
        userL2Addresses: opts.addressListL2,
    }
    const L2MPT = await createTokamakL2StateManagerFromL1RPC(opts.rpcUrl, stateManagerOpts)

    const transactionData: TokamakL2TxData = {
        to: createAddressFromString(opts.contractAddress),
        data: opts.callData,
    }
    const unsignedTransaction = createTokamakL2Tx(transactionData, {common})
    const signedTransaction = unsignedTransaction.sign(opts.senderL2PrvKey, true)
    return {
        signedTransaction,
        blockInfo,
        stateManager: L2MPT,
    }
}


