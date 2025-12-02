import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  SEPOLIA_RPC_URL,
  ROLLUP_BRIDGE_CORE_ADDRESS,
  CHANNEL_ID,
  TON_ADDRESS,
  WTON_ADDRESS,
  ROLLUP_BRIDGE_CORE_ABI,
} from './constants.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

async function checkMptKeys() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║        Check MPT Keys for Different Tokens                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(
    ROLLUP_BRIDGE_CORE_ADDRESS,
    ROLLUP_BRIDGE_CORE_ABI,
    provider,
  );

  // Get participants
  const participants = await bridgeContract.getChannelParticipants(CHANNEL_ID);
  console.log(`✅ Found ${participants.length} participants\n`);

  for (let i = 0; i < participants.length; i++) {
    const participant = participants[i];
    console.log(`👤 Participant ${i + 1}: ${participant}`);

    // Get MPT keys for TON and WTON
    const tonMptKey = await bridgeContract.getL2MptKey(CHANNEL_ID, participant, TON_ADDRESS);
    const wtonMptKey = await bridgeContract.getL2MptKey(CHANNEL_ID, participant, WTON_ADDRESS);

    const tonMptKeyHex = '0x' + tonMptKey.toString(16).padStart(64, '0');
    const wtonMptKeyHex = '0x' + wtonMptKey.toString(16).padStart(64, '0');

    console.log(`   TON MPT Key:  ${tonMptKeyHex}`);
    console.log(`   WTON MPT Key: ${wtonMptKeyHex}`);

    if (tonMptKeyHex.toLowerCase() === wtonMptKeyHex.toLowerCase()) {
      console.log(`   ⚠️  Same MPT key for both tokens!`);
    } else {
      console.log(`   ✅ Different MPT keys for different tokens`);
    }
    console.log('');
  }
}

checkMptKeys()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
