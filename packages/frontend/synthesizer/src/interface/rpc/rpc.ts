import { Common, CommonOpts, Mainnet, Sepolia } from "@ethereumjs/common"
import { createTokamakL2StateManagerFromL1RPC, createTokamakL2Tx, fromEdwardsToAddress, getEddsaPublicKey, poseidon, TokamakL2StateManagerOpts, TokamakL2TxData } from "../../TokamakL2JS/index.ts"
import { RPCStateManager } from "@ethereumjs/statemanager"
import { addHexPrefix, bigIntToHex, bytesToBigInt, bytesToHex, createAddressFromString, hexToBigInt, hexToBytes, toBytes } from "@ethereumjs/util"
import { ethers } from "ethers"
import { SynthesizerBlockInfo, SynthesizerOpts } from "src/synthesizer/types/index.ts"
import { jubjub } from "@noble/curves/misc"

export type SynthesizerSimulationOpts = {
  rpcUrl: string,
  blockNumber: number,
  contractAddress: `0x${string}`,
  addressListL1: `0x${string}`[],
  publicKeyListL2: Uint8Array[],

  // TX Info
  senderL2PrvKey: Uint8Array,
  txNonce: bigint,
  userStorageSlots: number[],
  callData: Uint8Array,

  // Optional: Skip RPC initialization if previousState will be used
  skipRPCInit?: boolean,
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
		blockHashes: hashes,
        // baseFee: BigInt(block.baseFeePerGas || '0x0'),
        // To avoid EIP check
        baseFee: undefined,
	}
}

export async function createSynthesizerOptsForSimulationFromRPC(opts: SynthesizerSimulationOpts): Promise<SynthesizerOpts> {
    if (typeof opts.rpcUrl !== 'string' || !opts.rpcUrl.startsWith('http')) {
      throw new Error(`valid RPC provider url required; got ${opts.rpcUrl}`)
    }
    const blockInfo = await getBlockInfoFromRPC(opts.rpcUrl, opts.blockNumber, 1)

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
        userStorageSlots: opts.userStorageSlots,
        userL1Addresses: opts.addressListL1,
        userL2Addresses: opts.publicKeyListL2.map(key => fromEdwardsToAddress(key)),
        rpcUrl: opts.rpcUrl, // Pass RPC URL for contract code fetching
    }
    const L2StateManager = await createTokamakL2StateManagerFromL1RPC(opts.rpcUrl, stateManagerOpts, opts.skipRPCInit || false)

    const transactionData: TokamakL2TxData = {
        nonce: opts.txNonce,
        to: createAddressFromString(opts.contractAddress),
        data: opts.callData,
        senderPubKey: jubjub.Point.BASE.multiply(bytesToBigInt(opts.senderL2PrvKey)).toBytes()
    }
    const unsignedTransaction = createTokamakL2Tx(transactionData, {common})
    const signedTransaction = unsignedTransaction.sign(opts.senderL2PrvKey)
    return {
        signedTransaction,
        blockInfo,
        stateManager: L2StateManager,
    }
}


