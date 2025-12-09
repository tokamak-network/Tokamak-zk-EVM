
import { ethers, parseEther } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { SEPOLIA_RPC_URL, ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI } from './constants.ts';
import {
  Address,
  hexToBytes,
  bytesToBigInt,
  bigIntToBytes,
  setLengthLeft,
  utf8ToBytes,
} from '@ethereumjs/util';
import { StateSnapshot } from '../../src/TokamakL2JS/stateManager/types.ts';
import { poseidon, getEddsaPublicKey, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

const RPC_URL = SEPOLIA_RPC_URL;
const CHANNEL_ID = 10;
const INITIALIZE_TX_HASH = '0x65a31d098ad36f36069073c539e3861685789788a7f753491ff67afc6357ac4d';

async function verifyRowsRef() {
  console.log('Starting Row Verification Test...');

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // 1. Fetch Init Tx
  const tx = await provider.getTransaction(INITIALIZE_TX_HASH);
  if (!tx || !tx.blockNumber) throw new Error('Tx not found');

  // 2. Fetch State Root
  const receipt = await provider.getTransactionReceipt(INITIALIZE_TX_HASH);
  if (!receipt) throw new Error('Receipt not found');
  const iface = new ethers.Interface(['event StateInitialized(uint256 indexed channelId, bytes32 currentStateRoot)']);
  const log = receipt.logs.find(l => l.topics[0] === ethers.id('StateInitialized(uint256,bytes32)'));
  if (!log) throw new Error('Log not found');
  const decodedEvent = iface.decodeEventLog('StateInitialized', log.data, log.topics);
  const onChainStateRoot = decodedEvent.currentStateRoot;

  // 3. Chain Data
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const [allowedTokens] = await bridgeContract.getChannelInfo(CHANNEL_ID);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  const storageEntries: Array<{ index: number; key: string; value: string }> = [];
  const registeredKeys: string[] = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    const token = allowedTokens[0];
    const key = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address, token);
    const keyHex = '0x' + key.toString(16).padStart(64, '0');
    const deposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, l1Address, token);

    registeredKeys.push(keyHex);
    storageEntries.push({
      index: i,
      key: keyHex,
      value: '0x' + deposit.toString(16).padStart(64, '0'),
    });
  }

  const initialState: StateSnapshot = {
    stateRoot: onChainStateRoot,
    registeredKeys: registeredKeys,
    storageEntries: storageEntries,
    contractAddress: allowedTokens[0],
    userL2Addresses: [],
    userStorageSlots: [0n],
    timestamp: Date.now(),
    userNonces: participants.map(() => 0n),
  };

  // 4. Setup Keys
  const PRIVATE_KEYS = [process.env.ALICE_PRIVATE_KEY, process.env.BOB_PRIVATE_KEY, process.env.CHARLIE_PRIVATE_KEY];
  const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Charlie'];

  const allPublicKeys: Uint8Array[] = [];
  const allL1Addresses: string[] = [];
  let senderPrivateKey: Uint8Array | undefined;

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    const idx = participants.findIndex(a => a.toLowerCase() === l1Address.toLowerCase());
    const wallet = new ethers.Wallet(PRIVATE_KEYS[idx]!);

    const seedString = `${wallet.signingKey.publicKey}${CHANNEL_ID}${PARTICIPANT_NAMES[idx]}`;
    const seedHash = poseidon(utf8ToBytes(seedString));
    const privKeyInt = bytesToBigInt(seedHash) % jubjub.Point.Fn.ORDER;
    const privKey = setLengthLeft(bigIntToBytes(privKeyInt === 0n ? 1n : privKeyInt), 32);

    allPublicKeys.push(jubjub.Point.BASE.multiply(bytesToBigInt(privKey)).toBytes());
    allL1Addresses.push(l1Address);

    if (i === 0) senderPrivateKey = privKey; // Participant 1 is sender
  }

  // 5. Run Transfer 1
  const adapter = new SynthesizerAdapter({ rpcUrl: RPC_URL });
  const output1 = resolve(__dirname, '../test-outputs/verify-inst-1');

  const p1Pub = jubjub.Point.fromBytes(allPublicKeys[0]);
  const p2Pub = jubjub.Point.fromBytes(allPublicKeys[1]);
  const p2Address = fromEdwardsToAddress(p2Pub).toString();

  const transferAmount = parseEther('0.1');
  const calldata = '0xa9059cbb' + p2Address.slice(2).padStart(64, '0') + transferAmount.toString(16).padStart(64, '0');

  console.log('Running Transfer 1...');
  const result1 = await adapter.synthesizeFromCalldata(calldata, {
    contractAddress: allowedTokens[0],
    publicKeyListL2: allPublicKeys,
    addressListL1: allL1Addresses,
    senderL2PrvKey: senderPrivateKey!,
    previousState: initialState,
    blockNumber: tx.blockNumber,
    userStorageSlots: [0],
    txNonce: 0n,
    tokenAddress: allowedTokens[0],
    outputPath: output1,
  });

  console.log('Result 1 User Nonces:', result1.state.userNonces);
  const senderIndex = 0; // Alice is index 0
  const nextNonce = BigInt(result1.state.userNonces[senderIndex]);
  console.log(`Sender Nonce in Result 1 (Next Nonce): ${nextNonce}`);

  // 6. Run Transfer 2 (Same transfer again, but with updated state)
  const output2 = resolve(__dirname, '../test-outputs/verify-inst-2');
  console.log('Running Transfer 2...');

  const result2 = await adapter.synthesizeFromCalldata(calldata, {
    contractAddress: allowedTokens[0],
    publicKeyListL2: allPublicKeys,
    addressListL1: allL1Addresses,
    senderL2PrvKey: senderPrivateKey!,
    previousState: result1.state, // Use state from result1
    blockNumber: tx.blockNumber,
    userStorageSlots: [0],
    txNonce: nextNonce, // Use the nonce from the updated state
    tokenAddress: allowedTokens[0],
    outputPath: output2,
  });

  // 7. Compare Instances
  console.log('Comparing instance.json files...');

  const json1 = JSON.parse(readFileSync(resolve(output1, 'instance.json'), 'utf-8'));
  const json2 = JSON.parse(readFileSync(resolve(output2, 'instance.json'), 'utf-8'));

  const func1 = json1.a_pub_function;
  const func2 = json2.a_pub_function;

  console.log(`Length 1: ${func1.length}, Length 2: ${func2.length}`);

  let changedCount = 0;
  // Compare row 71 to 250 (indices 0 to 179 approx?)
  // Note: JSON "a_pub_function" corresponds to "a_pub_function_description" lines in description file.
  // The description lines start at 0 relative to the section.
  // The user says "row 71 to 250" in the FILE (which involves description).
  // In `instance.json` (the VALUES), index 0 corresponds to the first line of `a_pub_function_description`.

  // User Row 72 (first description) -> Index 0.
  // User Row 250 (storage start) -> Index 250 - 72 = 178.

  // Checking range: Index 0 to 178.
  console.log('Checking indices 0 to 178 (corresponding to file rows 71-250)...');
  for (let i = 0; i < 179; i++) {
    if (func1[i] !== func2[i]) {
      console.log(`Difference at index ${i}: ${func1[i]} vs ${func2[i]}`);
      changedCount++;
    }
  }

  if (changedCount === 0) {
    console.log('✅ Indices 0 to 178 are IMMUTABLE.');
  } else {
    console.log(`❌ Found ${changedCount} differences in immutable range.`);
  }

  // Check storage rows (Index 178 to 178+6 = 184)
  console.log('Checking storage indices 178 upwards...');
  for (let i = 178; i < 184; i++) {
     console.log(`Index ${i}: ${func1[i]} -> ${func2[i]} (${func1[i] === func2[i] ? 'Same' : 'CHANGED'})`);
  }

}

verifyRowsRef().catch(console.error);
