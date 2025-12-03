/**
 * Test: Derive L2 Address from MPT Key
 *
 * This script demonstrates how to reverse-engineer L2 address from an on-chain MPT key.
 *
 * Formula:
 *   MPT key = l2Address ^ slot ^ tokenAddress (XOR operation)
 *   Therefore: l2Address = mptKey ^ slot ^ tokenAddress
 */

import { deriveL2AddressFromMptKey } from './constants';
import { TON_ADDRESS, WTON_ADDRESS } from './constants';

// Your actual MPT key from on-chain
const MPT_KEY_DECIMAL = '106333227096392236344952488842267144396529043294';
const MPT_KEY_BIGINT = BigInt(MPT_KEY_DECIMAL);

// Convert to hex (32 bytes = 64 hex chars)
const MPT_KEY_HEX = '0x' + MPT_KEY_BIGINT.toString(16).padStart(64, '0');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     Derive L2 Address from MPT Key                          ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('📊 Input Data:');
console.log(`   MPT Key (decimal): ${MPT_KEY_DECIMAL}`);
console.log(`   MPT Key (hex):     ${MPT_KEY_HEX}`);
console.log(`   MPT Key (bigint):  ${MPT_KEY_BIGINT.toString()}\n`);

// Try with TON token address
console.log('🔍 Trying with TON token address...');
console.log(`   Token Address: ${TON_ADDRESS}`);
console.log(`   Slot: 0 (ERC20 balance storage slot)\n`);

const l2AddressFromTON = deriveL2AddressFromMptKey(MPT_KEY_HEX, 0n, TON_ADDRESS);
console.log(`   ✅ Derived L2 Address: ${l2AddressFromTON}\n`);

// Try with WTON token address
console.log('🔍 Trying with WTON token address...');
console.log(`   Token Address: ${WTON_ADDRESS}`);
console.log(`   Slot: 0 (ERC20 balance storage slot)\n`);

const l2AddressFromWTON = deriveL2AddressFromMptKey(MPT_KEY_HEX, 0n, WTON_ADDRESS);
console.log(`   ✅ Derived L2 Address: ${l2AddressFromWTON}\n`);

// Show the XOR operation step by step
console.log('📐 Step-by-step XOR operation:');
console.log('   Formula: l2Address = mptKey ^ slot ^ tokenAddress\n');

console.log('   For TON:');
console.log(`   - mptKey:     ${MPT_KEY_HEX}`);
console.log(`   - slot:       0x${0n.toString(16).padStart(64, '0')}`);
console.log(`   - tokenAddr:  ${TON_ADDRESS.padEnd(66, ' ')}`);
console.log(`   - XOR result: ${l2AddressFromTON}\n`);

console.log('   For WTON:');
console.log(`   - mptKey:     ${MPT_KEY_HEX}`);
console.log(`   - slot:       0x${0n.toString(16).padStart(64, '0')}`);
console.log(`   - tokenAddr:  ${WTON_ADDRESS.padEnd(66, ' ')}`);
console.log(`   - XOR result: ${l2AddressFromWTON}\n`);

// Verification: Check if we can recreate the MPT key from the derived address
console.log('✅ Verification: Recreating MPT key from derived L2 address...\n');

function recreateMptKey(l2Address: string, slot: bigint, tokenAddress: string): string {
  const l2AddressBigInt = BigInt(l2Address);
  const tokenBigInt = BigInt(tokenAddress);
  const mptKeyBigInt = l2AddressBigInt ^ slot ^ tokenBigInt;
  return '0x' + mptKeyBigInt.toString(16).padStart(64, '0');
}

const recreatedMptKeyFromTON = recreateMptKey(l2AddressFromTON, 0n, TON_ADDRESS);
const recreatedMptKeyFromWTON = recreateMptKey(l2AddressFromWTON, 0n, WTON_ADDRESS);

console.log(`   From TON L2 address:  ${recreatedMptKeyFromTON}`);
console.log(`   Original MPT key:      ${MPT_KEY_HEX}`);
console.log(`   Match: ${recreatedMptKeyFromTON.toLowerCase() === MPT_KEY_HEX.toLowerCase() ? '✅ YES' : '❌ NO'}\n`);

console.log(`   From WTON L2 address: ${recreatedMptKeyFromWTON}`);
console.log(`   Original MPT key:      ${MPT_KEY_HEX}`);
console.log(`   Match: ${recreatedMptKeyFromWTON.toLowerCase() === MPT_KEY_HEX.toLowerCase() ? '✅ YES' : '❌ NO'}\n`);

// Determine which token was used
if (recreatedMptKeyFromTON.toLowerCase() === MPT_KEY_HEX.toLowerCase()) {
  console.log('🎯 Result: This MPT key was generated using TON token address');
  console.log(`   L2 Address: ${l2AddressFromTON}\n`);
} else if (recreatedMptKeyFromWTON.toLowerCase() === MPT_KEY_HEX.toLowerCase()) {
  console.log('🎯 Result: This MPT key was generated using WTON token address');
  console.log(`   L2 Address: ${l2AddressFromWTON}\n`);
} else {
  console.log('⚠️  Warning: Could not match MPT key with TON or WTON addresses');
  console.log('   The token address used might be different, or the slot might not be 0\n');
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    Test Completed                           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
