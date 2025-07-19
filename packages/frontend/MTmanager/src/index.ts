import { StateL2 } from './L2StateManager';
import { extractL1Storage } from './L1StateManager';
import { TransactionManager } from './transactionManager';

// --- Initial Setup ---

// Real USDC Contract Address on Ethereum Mainnet
const USDC_CONTRACT_ADDR = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// Some arbitrary L2 addresses for users (can be derived from public keys in a real system)
const USER_A_L2_ADDR = '0x3F6EE584a7eA3AD7f68C2cd831994Ae8157Aa98a'; 
const USER_B_L2_ADDR = '0x22e30A60FC173b3d4D8e42875250feB3Af371aCf';

// Addresses that will be part of our L2 state (for simplicity, including the contract itself)
const L2_STATE_ADDRESSES: string[] = [
    USER_A_L2_ADDR,
    USER_B_L2_ADDR,
    USDC_CONTRACT_ADDR, // Include the contract address in the L2 state for its storage
];

// Storage slot 0 is used for the balances mapping in our simulated token
const SLOTS = [0]; 

// A recent block number on Ethereum Mainnet where USDC contract exists.
// This is crucial for getBytecode and extractL1Storage to work.
const BLOCK_NUMBER = 20000000; // Example: Use a block number from mid-2024 or earlier for stability

async function main() {
    console.log("--- Step 1: Initial State Setup ---");

    // Fetch initial state from L1 (can be empty or pre-populated)
    // We are extracting storage for the USDC_CONTRACT_ADDR at slot 0 for our L2_STATE_ADDRESSES
    const L1Db = await extractL1Storage(USDC_CONTRACT_ADDR, SLOTS, L2_STATE_ADDRESSES, BLOCK_NUMBER);
    console.log(`Initial L1 state extracted:\n`, L1Db);

    // Build the L2 state from the L1 snapshot
    const stateL2 = await StateL2.build(USDC_CONTRACT_ADDR, SLOTS, BLOCK_NUMBER, L2_STATE_ADDRESSES, L2_STATE_ADDRESSES, L1Db);
    console.log("L2 Merkle trees constructed successfully.\n");

    // --- Step 2: Initialize Transaction Manager for a User ---
    console.log("--- Step 2: Initialize Transaction Manager ---");
    // We'll create a manager for User A
    const userA_Manager = new TransactionManager(stateL2);
    console.log(`User A Public Key: ${userA_Manager.publicKey}`);
    console.log(`Initial nonce: 0\n`);

    // --- Step 3: Create and Sign a Transaction ---
    console.log("--- Step 3: User A creates a transaction ---");
    // User A wants to transfer 100 tokens to User B.
    const transferAmount = 100n;

    // Manually construct the ERC20 transfer calldata
    // transfer(address to, uint256 amount)
    // Function selector: 0xa9059cbb
    const functionSelector = "0xa9059cbb";
    const toAddressPadded = USER_B_L2_ADDR.substring(2).padStart(64, '0');
    const amountPadded = transferAmount.toString(16).padStart(64, '0');
    const calldata = functionSelector + toAddressPadded + amountPadded;

    console.log(`Transaction Details:`);
    console.log(`  To (Contract): ${USDC_CONTRACT_ADDR}`);
    console.log(`  Data (Calldata): ${calldata.substring(0, 42)}...`);

    const signedTx = await userA_Manager.createAndSignTransaction(USDC_CONTRACT_ADDR, calldata);
    console.log(`\nTransaction signed successfully!`);
    console.log(`  Signature: ${signedTx.signature.substring(0, 40)}...`);

    // --- Step 4: Submit the Transaction to the L2 Network ---
    console.log("\n--- Step 4: Submitting transaction to the network ---");
    // Pass the BLOCK_NUMBER to submitTransaction for L1 context
    const success = await userA_Manager.submitTransaction(signedTx, BLOCK_NUMBER);

    if (success) {
        console.log("\nTransaction processed successfully!\n");
    } else {
        console.error("\nTransaction failed!\n");
        return; // Exit if failed
    }

    // --- Step 5: Verify Final State ---
    console.log("--- Step 5: Verifying final L2 state ---");
    const finalL1State = stateL2.reconstructL1State();
    // In our simplified ZkProver, it only updates the receiver's balance to the amount.
    // So, we expect User B's balance to be `transferAmount`.
    const finalUserBBalance = finalL1State[0][USER_B_L2_ADDR]; // slot 0, user B

    console.log(`Final reconstructed L1 state:\n`, finalL1State);
    console.log(`\nFinal balance of User B (${USER_B_L2_ADDR}) is: ${finalUserBBalance}`);

    if (finalUserBBalance === transferAmount) {
        console.log("✅ Verification successful: User B's balance is correct!");
    } else {
        console.error("❌ Verification failed: User B's balance is incorrect! Expected: " + transferAmount + ", Got: " + finalUserBBalance);
    }
}

main().catch(console.error);