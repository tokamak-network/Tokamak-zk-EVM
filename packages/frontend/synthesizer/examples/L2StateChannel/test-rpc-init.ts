/**
 * Test initTokamakExtendsFromRPC to see if it produces the correct Merkle root
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { bigIntToBytes, setLengthLeft, bytesToBigInt } from '@ethereumjs/util';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import {
  SEPOLIA_RPC_URL,
  ROLLUP_BRIDGE_CORE_ADDRESS,
  CHANNEL_ID,
  ROLLUP_BRIDGE_CORE_ABI,
} from './constants.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

async function testRPCInit() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test initTokamakExtendsFromRPC Merkle Root              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  // Get channel info
  const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(CHANNEL_ID);
  console.log(`Channel ID: ${CHANNEL_ID}`);
  console.log(`On-chain Initial Root: ${initialRoot}`);
  console.log('');

  // Get participants
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);
  console.log(`Participants: ${participants.length}`);

  // Generate L2 keys (deterministic)
  const participantsWithKeys = [];
  for (let i = 0; i < participants.length; i++) {
    const privateKey = setLengthLeft(bigIntToBytes(BigInt(i + 1) * 123456789n), 32);
    const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
    const l2Address = fromEdwardsToAddress(publicKey).toString();

    participantsWithKeys.push({
      l1Address: participants[i],
      l2Address,
      privateKey,
      publicKey,
    });
  }

  // Use initTokamakExtendsFromRPC
  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

  // Get block number from transaction
  const INIT_TX_HASH = '0x78f8e5dbb37bcc4caf192c058b6d1ef33d0ccbf87ec26d93819f04932eb542e0';
  const receipt = await provider.getTransactionReceipt(INIT_TX_HASH);
  if (!receipt) {
    throw new Error('Transaction not found');
  }
  const initBlockNumber = receipt.blockNumber;

  console.log(`Using block number: ${initBlockNumber}`);
  console.log('');

  // Create dummy calldata
  const dummyCalldata =
    '0xa9059cbb000000000000000000000000680310add42c978d92f195f0dca8b237af9c58380000000000000000000000000000000000000000000000000000000000000000';

  const result = await adapter.synthesizeFromCalldata(dummyCalldata, {
    contractAddress: allowedTokens[0],
    publicKeyListL2: participantsWithKeys.map(p => p.publicKey),
    addressListL1: participantsWithKeys.map(p => p.l1Address) as `0x${string}`[],
    senderL2PrvKey: participantsWithKeys[0].privateKey,
    blockNumber: initBlockNumber,
    userStorageSlots: [0],
    outputPath: resolve(__dirname, 'test-outputs/rpc-init-test'),
  });

  console.log(`\nMerkle Root from initTokamakExtendsFromRPC: ${result.initialStateRoot}`);
  console.log(`On-chain Initial Root:                      ${initialRoot}`);
  console.log('');

  if (result.initialStateRoot?.toLowerCase() === initialRoot.toLowerCase()) {
    console.log('✅ Merkle roots match!');
  } else {
    console.log('❌ Merkle roots DO NOT match!');
  }
}

testRPCInit()
  .then(() => {
    console.log('\n🎉 Test complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
