/**
 * Explanation: L2 Address vs MPT Key Relationship
 * 
 * This script explains the relationship between:
 * - L1 Address (participant on L1)
 * - L2 Address (derived from public key or MPT key)
 * - MPT Key (storage key for specific token)
 */

import { deriveL2AddressFromMptKey, generateL2StorageKey } from './constants';
import { TON_ADDRESS, WTON_ADDRESS } from './constants';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     L2 Address vs MPT Key Relationship                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Example: Your actual MPT key for TON
const mptKeyTON = '106333227096392236344952488842267144396529043294';
const mptKeyBigInt = BigInt(mptKeyTON);
const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');

// Derive L2 address from MPT key
const l2Address = deriveL2AddressFromMptKey(mptKeyHex, 0n, TON_ADDRESS);

console.log('📋 Example Scenario:\n');
console.log('   L1 Participant: 0x... (some L1 address)');
console.log(`   ↓ (derived from public key or MPT key)`);
console.log(`   L2 Address:      ${l2Address}`);
console.log('   ↓ (used with different tokens)');
console.log('   Different MPT keys for different tokens\n');

console.log('🔑 Key Points:\n');
console.log('   1. L2 Address is UNIQUE per L1 participant');
console.log('      - Same L1 participant → Same L2 address');
console.log('      - Token-independent (does not change per token)\n');

console.log('   2. MPT Key is UNIQUE per (L1 participant, token) pair');
console.log('      - Same L1 participant + TON  → One MPT key');
console.log('      - Same L1 participant + WTON → Different MPT key\n');

console.log('📊 Your Actual Data:\n');
console.log(`   MPT Key (TON):  ${mptKeyHex}`);
console.log(`   L2 Address:    ${l2Address}`);
console.log(`   Token (TON):   ${TON_ADDRESS}\n`);

// Show how MPT keys differ for same L2 address with different tokens
console.log('🔄 Demonstrating: Same L2 Address, Different MPT Keys\n');

// Recreate MPT keys for TON and WTON using the same L2 address
const mptKeyForTON = generateL2StorageKey(l2Address, 0n, TON_ADDRESS);
const mptKeyForWTON = generateL2StorageKey(l2Address, 0n, WTON_ADDRESS);

console.log(`   L2 Address: ${l2Address}\n`);
console.log(`   + TON token:  ${TON_ADDRESS}`);
console.log(`   → MPT Key:    ${mptKeyForTON}\n`);
console.log(`   + WTON token: ${WTON_ADDRESS}`);
console.log(`   → MPT Key:    ${mptKeyForWTON}\n`);

console.log('   ✅ Same L2 address, but different MPT keys!\n');

// Verify the relationship
console.log('✅ Verification:\n');
console.log('   Formula: MPT Key = L2 Address ^ Slot ^ Token Address\n');
console.log(`   For TON:`);
console.log(`   - L2 Address: ${l2Address}`);
console.log(`   - Slot:       0x${0n.toString(16).padStart(40, '0')}`);
console.log(`   - Token:      ${TON_ADDRESS}`);
console.log(`   - XOR result: ${mptKeyForTON}`);
console.log(`   - Matches original: ${mptKeyForTON.toLowerCase() === mptKeyHex.toLowerCase() ? '✅ YES' : '❌ NO'}\n`);

console.log('📝 Summary:\n');
console.log(`   • L2 Address "${l2Address}" is the L2 representation of an L1 participant`);
console.log(`   • This L2 address is used for ALL tokens (TON, WTON, etc.)`);
console.log(`   • But each token gets a DIFFERENT MPT key for storage`);
console.log(`   • MPT key = L2 Address ^ Slot ^ Token Address`);
console.log(`   • Your MPT key "${mptKeyHex}" is specifically for TON token\n`);

console.log('💡 In Practice:\n');
console.log('   When you query:');
console.log(`   - getL2MptKey(channelId, L1_PARTICIPANT, TON_ADDRESS)`);
console.log(`     → Returns: ${mptKeyHex}`);
console.log(`   - getL2MptKey(channelId, L1_PARTICIPANT, WTON_ADDRESS)`);
console.log(`     → Returns: Different MPT key (for WTON)\n`);
console.log('   But the L2 address derived from both MPT keys is the same!\n');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    Explanation Complete                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

