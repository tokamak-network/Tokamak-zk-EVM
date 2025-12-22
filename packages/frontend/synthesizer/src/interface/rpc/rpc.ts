import { Common, CommonOpts, Mainnet, Sepolia } from "@ethereumjs/common"
import { createTokamakL2StateManagerFromL1RPC, createTokamakL2Tx, fromEdwardsToAddress, getEddsaPublicKey, poseidon, TokamakL2StateManagerOpts, TokamakL2TxData } from "../../TokamakL2JS/index.ts"
import { RPCStateManager } from "@ethereumjs/statemanager"
import { addHexPrefix, bigIntToHex, bytesToBigInt, bytesToHex, createAddressFromString, hexToBigInt, hexToBytes, toBytes } from "@ethereumjs/util"
import { ethers } from "ethers"
import { SynthesizerBlockInfo, SynthesizerOpts } from "../../synthesizer/types/index.ts"
import { jubjub } from "@noble/curves/misc.js"
import { NUMBER_OF_PREV_BLOCK_HASHES } from "../qapCompiler/importedConstants.ts"

export type SynthesizerSimulationOpts = {
  rpcUrl: string,
  blockNumber: number,
  contractAddress: `0x${string}`,
  initStorageKeys: {
    L1: Uint8Array,
    L2: Uint8Array,
  }[],

  // TX Info
  senderL2PrvKey: Uint8Array,
  txNonce: bigint,
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
        if (block === undefined || block === null) {
            throw new Error(`Can't retrieve a previous block hash. The block is ${block}.`)
        }
        if (block.hash === undefined || block.hash === null ){
            throw new Error(`Can't retrieve a previous block hash. It's ${block?.hash}.`)
        }
		return block.hash
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
		blockHashes: hashes,
        baseFee: BigInt(block.baseFeePerGas || '0x0'),
        // To avoid EIP check
	}
}

export async function createSynthesizerOptsForSimulationFromRPC(opts: SynthesizerSimulationOpts): Promise<SynthesizerOpts> {
    if (typeof opts.rpcUrl !== 'string' || !opts.rpcUrl.startsWith('http')) {
      throw new Error(`valid RPC provider url required; got ${opts.rpcUrl}`)
    }
    const blockInfo = await getBlockInfoFromRPC(opts.rpcUrl, opts.blockNumber, NUMBER_OF_PREV_BLOCK_HASHES)

    const commonOpts: CommonOpts = {
        chain: {
            ...Mainnet,
        },
        customCrypto: { keccak256: poseidon, ecrecover: getEddsaPublicKey }
    }
    const common = new Common(commonOpts)

    const stateManagerOpts: TokamakL2StateManagerOpts = {
        common,
        blockNumber: opts.blockNumber,
        contractAddress: opts.contractAddress,
        initStorageKeys: opts.initStorageKeys,
    }
    const L2StateManager = await createTokamakL2StateManagerFromL1RPC(opts.rpcUrl, stateManagerOpts)

    const transactionData: TokamakL2TxData = {
        nonce: opts.txNonce,
        to: createAddressFromString(opts.contractAddress),
        data: opts.callData,
        senderPubKey: jubjub.Point.BASE.multiply(bytesToBigInt(opts.senderL2PrvKey) % jubjub.Point.Fn.ORDER).toBytes()
    }
    const unsignedTransaction = createTokamakL2Tx(transactionData, {common})
    const signedTransaction = unsignedTransaction.sign(opts.senderL2PrvKey)
    return {
        signedTransaction,
        blockInfo,
        stateManager: L2StateManager,
    }
}


