/**
 * Test L2 Transfer using tokamak-cli
 *
 * This test uses the tokamak-cli wrapper to execute l2-transfer command.
 * It demonstrates the integration with the main CLI tool.
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { SEPOLIA_RPC_URL, ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI } from './constants.ts';
import {
  bytesToBigInt,
  bigIntToBytes,
  setLengthLeft,
  utf8ToBytes,
} from '@ethereumjs/util';
import { poseidon, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Derive L2 address from L2 private key
 */
function deriveL2AddressFromPrivateKey(l2PrivateKey: Uint8Array): string {
  const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(l2PrivateKey)).toBytes();
  const l2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(publicKey)).toString();
  return l2Address;
}

/**
 * Convert L2 private key to hex string for CLI
 */
function l2PrivateKeyToHex(l2PrivateKey: Uint8Array): string {
  return '0x' + Buffer.from(l2PrivateKey).toString('hex');
}

/**
 * Run tokamak-cli l2-transfer command
 */
async function runTokamakCliL2Transfer(params: {
  channelId: number;
  initializeTxHash: string;
  senderL2PrvKey: Uint8Array;
  recipientL2Address: string;
  amount: string;
  previousStatePath?: string;
  rpcUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const {
    channelId,
    initializeTxHash,
    senderL2PrvKey,
    recipientL2Address,
    amount,
    previousStatePath,
    rpcUrl,
  } = params;

  // Get tokamak-cli path (project root)
  const projectRoot = resolve(__dirname, '../../../../../');
  const tokamakCli = resolve(projectRoot, 'tokamak-cli');

  if (!existsSync(tokamakCli)) {
    return {
      success: false,
      error: `tokamak-cli not found at ${tokamakCli}`,
    };
  }

  const senderKeyHex = l2PrivateKeyToHex(senderL2PrvKey);

  try {
    const cmd = [
      `"${tokamakCli}"`,
      '--l2-transfer',
      `--channel-id ${channelId}`,
      `--init-tx ${initializeTxHash}`,
      `--sender-key ${senderKeyHex}`,
      `--recipient ${recipientL2Address}`,
      `--amount ${amount}`,
      `--rpc-url "${rpcUrl}"`,
      '--sepolia',
    ];

    if (previousStatePath) {
      cmd.push(`--previous-state "${previousStatePath}"`);
    }

    const fullCmd = cmd.join(' ');

    console.log(`   Running: tokamak-cli --l2-transfer...`);
    console.log(`   Command: ${fullCmd.replace(senderKeyHex, '0x***')}`); // Hide private key in logs

    const output = execSync(fullCmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300000, // 5 minute timeout
      cwd: projectRoot,
    });

    console.log(`   ✅ Transfer completed successfully`);
    return {
      success: true,
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const stdout = error.stdout || '';
    const stderr = error.stderr || '';
    return {
      success: false,
      error: `${errorMessage}\nstdout: ${stdout.substring(0, 500)}\nstderr: ${stderr.substring(0, 500)}`,
    };
  }
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function main() {
  const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || '4');
  const INITIALIZE_TX_HASH =
    process.env.INITIALIZE_TX_HASH || '0xef83ef333908e2cec7bbfe3eb8719d7dc1464ef917637ca98868a195e75564c6';
  const RPC_URL = SEPOLIA_RPC_URL;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Test: L2 Transfer using tokamak-cli                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`🌐 Using RPC: ${RPC_URL}`);
  console.log(`🔗 Channel ID: ${CHANNEL_ID}`);
  console.log(`📝 Init TX: ${INITIALIZE_TX_HASH}\n`);

  // Read L1 private keys from environment (for testing only)
  const PRIVATE_KEYS = [process.env.ALICE_PRIVATE_KEY, process.env.BOB_PRIVATE_KEY, process.env.CHARLIE_PRIVATE_KEY];
  if (!PRIVATE_KEYS[0] || !PRIVATE_KEYS[1] || !PRIVATE_KEYS[2]) {
    console.error('❌ Error: Private keys not found in .env file');
    process.exit(1);
  }

  // Get participants from on-chain
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  console.warn('⚠️  WARNING: Generating L2 keys from L1 keys for testing purposes.');
  console.warn('   In production, L2 private keys should be provided directly.\n');

  // Generate L2 private keys (for testing)
  const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Charlie'];
  const participantL2PrivateKeys: Uint8Array[] = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    const participantIndex = participants.findIndex(addr => addr.toLowerCase() === l1Address.toLowerCase());

    if (participantIndex === -1 || !PRIVATE_KEYS[participantIndex]) {
      throw new Error(`Private key not found for participant ${l1Address}`);
    }

    const wallet = new ethers.Wallet(PRIVATE_KEYS[participantIndex]!);
    if (wallet.address.toLowerCase() !== l1Address.toLowerCase()) {
      throw new Error(`Address mismatch: expected ${l1Address}, got ${wallet.address}`);
    }

    // Generate L2 private key
    const l1PublicKeyHex = wallet.signingKey.publicKey;
    const seedString = `${l1PublicKeyHex}${CHANNEL_ID}${PARTICIPANT_NAMES[participantIndex]!}`;
    const seedBytes = utf8ToBytes(seedString);
    const seedHashBytes = poseidon(seedBytes);
    const seedHashBigInt = bytesToBigInt(seedHashBytes);
    const privateKeyBigInt = seedHashBigInt % jubjub.Point.Fn.ORDER;
    const privateKeyValue = privateKeyBigInt === 0n ? 1n : privateKeyBigInt;
    const l2PrivateKey = setLengthLeft(bigIntToBytes(privateKeyValue), 32);

    participantL2PrivateKeys.push(l2PrivateKey);
  }

  // Derive L2 addresses from L2 private keys
  const allL2Addresses: string[] = participantL2PrivateKeys.map(deriveL2AddressFromPrivateKey);

  // ========================================================================
  // TEST: Participant 1 → 2 (1 TON)
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Test: Participant 1 → 2 (1 TON)              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const result1 = await runTokamakCliL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: participantL2PrivateKeys[0],
    recipientL2Address: allL2Addresses[1],
    amount: '1',
    rpcUrl: RPC_URL,
  });

  if (!result1.success) {
    console.error(`❌ Test failed: ${result1.error}`);
    process.exit(1);
  }

  console.log(`\n✅ L2 Transfer test completed successfully!`);
  console.log(`   Outputs should be in: dist/macOS/resource/synthesizer/output/`);

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Summary                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('✅ Successfully executed L2 transfer using tokamak-cli!');
  console.log('');
  console.log('📁 Output Location:');
  console.log('   dist/macOS/resource/synthesizer/output/');
  console.log('   - instance.json');
  console.log('   - instance_description.json');
  console.log('   - state_snapshot.json');
  console.log('');
  console.log('🔄 Next Steps:');
  console.log('   - Run: ./tokamak-cli --preprocess');
  console.log('   - Run: ./tokamak-cli --prove');
  console.log('   - Run: ./tokamak-cli --verify');

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Completed Successfully!               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// Run test
main()
  .then(() => {
    console.log('\n🎉 Test passed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
