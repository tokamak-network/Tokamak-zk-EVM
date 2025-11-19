import { bytesToHex, concatBytes, setLengthLeft, hexToBytes, bigIntToBytes } from '@ethereumjs/util';
import { keccak256 } from 'ethereum-cryptography/keccak.js';

// Alice's L2 address from test output
const aliceL2Address = '0x99fa965b6d9448768394bf7db140bc87d8685f94';

// EVM이 읽으려는 첫 번째 key
const evmKey1 = '0x17c11b3bb816dc660c8c93a832ae1117d532e1204d3e62271ccf146586a04769';

// 등록된 Alice의 L2 Storage Key
const registeredKey = '0xc09c446db5bc9816afad202d73ab5c0d7ce53eda061f2335ca29742a85e943ca';

console.log('🔍 Verifying Storage Key Mismatch\n');

// Calculate what the storage key SHOULD be: keccak256(alice_L2, slot_0)
const addressBytes = setLengthLeft(hexToBytes(aliceL2Address), 32);
const slotBytes = setLengthLeft(bigIntToBytes(0n), 32);
const packed = concatBytes(addressBytes, slotBytes);
const calculatedKey = keccak256(packed);
const calculatedKeyHex = bytesToHex(calculatedKey);

console.log(`Alice L2 Address: ${aliceL2Address}`);
console.log(`\nCalculated Storage Key (keccak256(alice_L2, 0)):`);
console.log(`  ${calculatedKeyHex}`);

console.log(`\nEVM tried to load:`);
console.log(`  ${evmKey1}`);

console.log(`\nRegistered in L2 StateManager:`);
console.log(`  ${registeredKey}`);

console.log(`\n--- Comparison ---`);
console.log(`Calculated matches EVM?        ${calculatedKeyHex.toLowerCase() === evmKey1.toLowerCase() ? '✅ YES' : '❌ NO'}`);
console.log(`Calculated matches Registered? ${calculatedKeyHex.toLowerCase() === registeredKey.toLowerCase() ? '✅ YES' : '❌ NO'}`);
console.log(`EVM matches Registered?        ${evmKey1.toLowerCase() === registeredKey.toLowerCase() ? '✅ YES' : '❌ NO'}`);

