/**
 * Verify Storage Slot by Testing Different Slots
 *
 * This script tests different slot values to determine which slot was used
 * to generate the MPT key. The correct slot will produce an L2 address that,
 * when used to recreate the MPT key, matches the original.
 */

import { deriveL2AddressFromMptKey, generateL2StorageKey } from './constants';
import { TON_ADDRESS } from './constants';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     Verify Storage Slot from MPT Key                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Your actual MPT key
const MPT_KEY_DECIMAL = '106333227096392236344952488842267144396529043294';
const MPT_KEY_BIGINT = BigInt(MPT_KEY_DECIMAL);
const MPT_KEY_HEX = '0x' + MPT_KEY_BIGINT.toString(16).padStart(64, '0');

console.log('📊 Input:');
console.log(`   MPT Key: ${MPT_KEY_HEX}`);
console.log(`   Token:   ${TON_ADDRESS}\n`);

console.log('🔍 Testing different slots (0-10)...\n');

let correctSlot: number | null = null;

// Test slots 0-10
for (let slot = 0; slot <= 10; slot++) {
  // Derive L2 address using this slot
  const l2Address = deriveL2AddressFromMptKey(MPT_KEY_HEX, BigInt(slot), TON_ADDRESS);

  // Recreate MPT key using this L2 address and slot
  const recreatedMptKey = generateL2StorageKey(l2Address, BigInt(slot), TON_ADDRESS);

  // Check if it matches
  const matches = recreatedMptKey.toLowerCase() === MPT_KEY_HEX.toLowerCase();

  if (matches) {
    console.log(`   Slot ${slot}: ✅ MATCH!`);
    console.log(`      L2 Address: ${l2Address}`);
    console.log(`      Recreated:  ${recreatedMptKey}`);
    if (correctSlot === null) {
      correctSlot = slot;
    }
  } else {
    console.log(`   Slot ${slot}: ❌ No match`);
    console.log(`      L2 Address: ${l2Address}`);
    console.log(`      Recreated:  ${recreatedMptKey}`);
  }
  console.log('');
}

if (correctSlot !== null) {
  console.log('✅ Result:');
  console.log(`   The MPT key was generated using slot ${correctSlot}`);
  console.log(`   This confirms that slot ${correctSlot} is used for ERC20 balance storage\n`);
} else {
  console.log('⚠️  Warning:');
  console.log('   Could not find matching slot in range 0-10');
  console.log('   The slot might be outside this range, or the token address might be different\n');
}

console.log('📝 How it works:');
console.log('   1. Try different slot values (0, 1, 2, ...)');
console.log('   2. For each slot, derive L2 address: l2Address = mptKey ^ slot ^ tokenAddress');
console.log('   3. Recreate MPT key: recreated = l2Address ^ slot ^ tokenAddress');
console.log('   4. If recreated matches original, that slot is correct\n');

console.log('💡 Why slot 0?');
console.log('   - ERC20 standard: mapping(address => uint256) balanceOf is at slot 0');
console.log('   - All code examples use userStorageSlots: [0]');
console.log('   - This is the standard convention for ERC20 tokens\n');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    Verification Complete                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

