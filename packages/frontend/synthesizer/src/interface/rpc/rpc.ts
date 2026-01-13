import { Common, CommonOpts, Mainnet, Sepolia } from "@ethereumjs/common"
import { createTokamakL2StateManagerFromL1RPC, createTokamakL2Tx, fromEdwardsToAddress, getEddsaPublicKey, poseidon, TokamakL2StateManagerOpts, TokamakL2TxData } from "tokamak-l2js"
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

  erc20TxsData: {
    senderL2PrvKey: Uint8Array,
    nonce: bigint,
    data: Uint8Array,
  }[],
}

export async function getBlockInfoFromRPC(
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

	const hashes: `0x${string}`[] = new Array<`0x${string}`>(nHashes)
	for ( var i = 0; i < nHashes; i++){
		const prevBlockNumber = blockNumber - i
		hashes[i] = addHexPrefix(await _getBlockHashFromProvider(provider, prevBlockNumber))
	}

	return {
		coinBase: addHexPrefix(block.miner!),
		timeStamp: addHexPrefix(block.timestamp.toString(16)),
		blockNumber: addHexPrefix(block.number.toString(16)),
		prevRanDao: block.prevRandao == null ? bigIntToHex(block.difficulty) : addHexPrefix(block.prevRandao),
		gasLimit: bigIntToHex(block.gasLimit),
		chainId: bigIntToHex((await provider.getNetwork()).chainId),
		selfBalance: '0x0',
		blockHashes: hashes,
        baseFee: bigIntToHex(block.baseFeePerGas || 0n),
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
        contractAddress: createAddressFromString(opts.contractAddress),
        initStorageKeys: opts.initStorageKeys,
    }
    const L2StateManager = await createTokamakL2StateManagerFromL1RPC(opts.rpcUrl, stateManagerOpts)

    const signedTxsData: TokamakL2TxData[] = [];
    for (const txData of opts.erc20TxsData) {
        const transactionData: TokamakL2TxData = {
            nonce: txData.nonce,
            to: createAddressFromString(opts.contractAddress),
            data: txData.data,
            senderPubKey: jubjub.Point.BASE.multiply(bytesToBigInt(txData.senderL2PrvKey)).toBytes()
        };
        const unsignedTransaction = createTokamakL2Tx(transactionData, {common});
        const signedTransaction = unsignedTransaction.sign(txData.senderL2PrvKey);
        signedTxsData.push({
            nonce: txData.nonce,
            to: transactionData.to,
            data: txData.data,
            senderPubKey: transactionData.senderPubKey,
            v: signedTransaction.v,
            r: signedTransaction.r,
            s: signedTransaction.s,
        });
    }
    
    return {
        signedTransactions: signedTxsData,
        blockInfo,
        stateManager: L2StateManager,
    }
}


