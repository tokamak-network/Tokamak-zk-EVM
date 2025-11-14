// Test file for formatting rules
// This file demonstrates the new compact formatting style

import { createHash } from 'crypto';

// Example 1: Simple function calls with chaining
// OLD STYLE: Would break into multiple lines
// NEW STYLE: Keep compact on one line
const hash1 = createHash('sha256').update('hello world').digest('hex');

const publicKeyListL2 = [
  senderL2PubKey,
  TOKEN_RECEPIENT_PUB_KEY,
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x838F176D94990E06af9B57E470047F9978403195'), 32)).publicKey,
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x01E371b2aD92aDf90254df20EB73F68015E9A000'), 32)).publicKey,
  jubjub.keygen(setLengthLeft(utf8ToBytes('0xbD224229Bf9465ea4318D45a8ea102627d6c27c7'), 32)).publicKey,
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x6FD430995A19a57886d94f8B5AF2349b8F40e887'), 32)).publicKey,
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x0CE8f6C9D4aD12e56E54018313761487d2D1fee9'), 32)).publicKey,
  jubjub.keygen(setLengthLeft(utf8ToBytes('0x60be9978F805Dd4619F94a449a4a798155a05A56'), 32)).publicKey,
];

const senderL2PubKey = jubjub.Point.BASE.multiply(bytesToBigInt(senderL2PrvKey)).toBytes();

// Example 2: Array of complex expressions
// Each entry is one logical unit, so one line per entry
const publicKeyList = [
  'simple-string-entry',
  createHash('sha256').update('address1').digest('hex'),
  createHash('sha256').update('address2').digest('hex'),
  createHash('sha256').update('address3').digest('hex'),
  createHash('sha256').update('address4').digest('hex'),
  createHash('sha256')
    .update('very-long-address-that-might-exceed-eighty-characters-but-stays-on-one-line')
    .digest('hex'),
];

// Example 3: Nested function calls
// Keep on one line if it's a simple transformation chain
const result1 = Buffer.from(createHash('sha256').update('data').digest()).toString('hex');

// Example 4: Function with many parameters
// Break lines for distinct operations with meaningful params
function createTransaction(sender: string, receiver: string, amount: number, timestamp: number, signature: string) {
  return { sender, receiver, amount, timestamp, signature };
}

// Example 5: Method chaining with distinct operations
// Each operation is meaningful, so break lines
const app = {
  command: (cmd: string) => app,
  description: (desc: string) => app,
  argument: (arg: string, desc: string) => app,
  option: (opt: string, desc: string) => app,
  action: (fn: Function) => app,
};

app
  .command('run')
  .description('Run synthesizer for a given transaction hash')
  .argument('<txHash>', 'Ethereum transaction hash (0x...)')
  .option('-r, --rpc <url>', 'RPC URL for Ethereum node')
  .action(async (txHash: string, options: { rpc?: string }) => {
    console.log(`Processing ${txHash}`);
  });

// Example 6: Object with many properties
// This should stay nicely formatted
const config = {
  host: 'localhost',
  port: 8545,
  network: 'mainnet',
  timeout: 30000,
  retries: 3,
};

// Example 7: Long line that should NOT be aggressively broken
// Constants without semantic meaning stay inline
const processedData = someFunction(inputData, transformData(rawInput, 32, 'utf8', true), outputFormat);

// Example 8: Complex nested object that SHOULD break
const transaction = {
  from: createHash('sha256').update('sender').digest('hex'),
  to: createHash('sha256').update('receiver').digest('hex'),
  value: 1000,
  data: Buffer.from('transaction data').toString('hex'),
  signature: createHash('sha256').update('signature').digest('hex'),
};

// Example 9: Array of objects - each object is one info unit
const transactions = [
  { from: 'alice', to: 'bob', amount: 100 },
  { from: 'bob', to: 'charlie', amount: 50 },
  { from: 'charlie', to: 'alice', amount: 75 },
];

// Example 10: Conditional with compact style
const value = someCondition ? calculateValue(input1, input2, input3) : getDefaultValue();

// Example 11: Very long array entries
const addresses = [
  'address_1_that_is_quite_long_but_still_represents_one_piece_of_information',
  'address_2_that_is_quite_long_but_still_represents_one_piece_of_information',
  'address_3_that_is_quite_long_but_still_represents_one_piece_of_information',
];

// Helper functions for demonstration
function someFunction(a: any, b: any, c: any): any {
  return { a, b, c };
}

function transformData(input: any, size: number, encoding: string, flag: boolean): any {
  return Buffer.from(input).slice(0, size);
}

function calculateValue(a: number, b: number, c: number): number {
  return a + b + c;
}

function getDefaultValue(): number {
  return 0;
}

const inputData = 'test';
const rawInput = 'raw';
const outputFormat = 'hex';
const someCondition = true;
const input1 = 1;
const input2 = 2;
const input3 = 3;

export { publicKeyList, config, transactions };
