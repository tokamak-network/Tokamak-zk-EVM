import { JsonRpcProvider } from 'ethers';
import { bytesToHex, concatBytes, setLengthLeft, hexToBytes, bigIntToBytes } from '@ethereumjs/util';
import { keccak256 } from 'ethereum-cryptography/keccak.js';

const provider = new JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S');
const tonAddress = '0xa30fe40285b8f5c0457dbc3b7c8a280373c40044';
const aliceAddress = '0xf9fa94d45c49e879e46ea783fc133f41709f3bc7';

async function checkStorageSlots() {
  console.log('🔍 Checking TON contract storage slots for Alice...\n');
  console.log(`Contract: ${tonAddress}`);
  console.log(`Alice (L1): ${aliceAddress}\n`);

  // Test slots 0-5
  for (let slot = 0; slot < 6; slot++) {
    // Calculate storage key: keccak256(abi.encodePacked(address, slot))
    const addressBytes = setLengthLeft(hexToBytes(aliceAddress), 32);
    const slotBytes = setLengthLeft(bigIntToBytes(BigInt(slot)), 32);
    const packed = concatBytes(addressBytes, slotBytes);
    const storageKey = keccak256(packed);
    const storageKeyHex = bytesToHex(storageKey);

    console.log(`Slot ${slot}:`);
    console.log(`  Storage Key: ${storageKeyHex}`);

    try {
      const value = await provider.getStorage(tonAddress, storageKeyHex);
      const valueBigInt = BigInt(value);

      if (valueBigInt > 0n) {
        console.log(`  ✅ Value: ${valueBigInt} (${valueBigInt / 10n**18n} TON)`);
      } else {
        console.log(`  Value: 0`);
      }
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    console.log('');
  }
}

checkStorageSlots().catch(console.error);

