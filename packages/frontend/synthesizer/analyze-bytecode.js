const ethers = require('ethers');

(async () => {
  const mainnetProvider = new ethers.JsonRpcProvider(
    'https://eth-mainnet.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S',
  );
  const sepoliaProvider = new ethers.JsonRpcProvider(
    'https://eth-sepolia.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S',
  );

  const mainnetAddr = '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5';
  const sepoliaAddr = '0xa30fe40285b8f5c0457dbc3b7c8a280373c40044';

  console.log('🔍 Analyzing TON Contract Bytecode Differences\n');

  // Get bytecode
  const mainnetCode = await mainnetProvider.getCode(mainnetAddr);
  const sepoliaCode = await sepoliaProvider.getCode(sepoliaAddr);

  console.log('📊 Bytecode Analysis:');
  console.log(`  Mainnet:  ${mainnetCode.length / 2 - 1} bytes`);
  console.log(`  Sepolia:  ${sepoliaCode.length / 2 - 1} bytes`);
  const diff = (sepoliaCode.length - mainnetCode.length) / 2;
  const pct = ((sepoliaCode.length / mainnetCode.length - 1) * 100).toFixed(1);
  console.log(`  Difference: ${diff} bytes (${pct}% larger)\n`);

  // Function selectors
  console.log('🔑 Function Signatures (first 100 bytes):');
  console.log(`  Mainnet:  ${mainnetCode.slice(0, 100)}`);
  console.log(`  Sepolia:  ${sepoliaCode.slice(0, 100)}\n`);

  // Check for specific patterns
  const countOccurrences = (str, pattern) => (str.match(new RegExp(pattern, 'g')) || []).length;

  console.log('📈 Opcode Pattern Analysis:');
  console.log(`  JUMPDEST (5b) occurrences:`);
  console.log(`    Mainnet:  ${countOccurrences(mainnetCode, '5b')}`);
  console.log(`    Sepolia:  ${countOccurrences(sepoliaCode, '5b')}`);
  console.log(`  REVERT (fd) occurrences:`);
  console.log(`    Mainnet:  ${countOccurrences(mainnetCode, 'fd')}`);
  console.log(`    Sepolia:  ${countOccurrences(sepoliaCode, 'fd')}`);
  console.log(`  SSTORE (55) occurrences:`);
  console.log(`    Mainnet:  ${countOccurrences(mainnetCode, '55')}`);
  console.log(`    Sepolia:  ${countOccurrences(sepoliaCode, '55')}`);
  console.log(`  SLOAD (54) occurrences:`);
  console.log(`    Mainnet:  ${countOccurrences(mainnetCode, '54')}`);
  console.log(`    Sepolia:  ${countOccurrences(sepoliaCode, '54')}\n`);

  // Metadata comparison
  console.log('📝 Contract Metadata:');
  const getMetadata = code => {
    // Solidity metadata is at the end
    const metadataStart = code.lastIndexOf('a165627a7a72305820');
    if (metadataStart !== -1) {
      return code.slice(metadataStart, metadataStart + 100);
    }
    return 'Not found';
  };

  console.log(`  Mainnet metadata: ${getMetadata(mainnetCode)}`);
  console.log(`  Sepolia metadata: ${getMetadata(sepoliaCode)}\n`);
})();

