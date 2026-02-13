**A Development Report on an Automated ERC20 Configuration Generator**

**Introduction**  
This report presents the development of a new product, `generate-erc20-config.ts`, designed to automate the creation of configuration files required to synthesize ERC20 transfer transactions within the Tokamak zk-EVM synthesizer package. The motivation for this work was to reduce the manual effort and domain expertise needed to assemble valid configuration inputs, especially for recurring ERC20 transfer flows. The product combines on-chain data retrieval, deterministic parsing of transaction inputs, and iterative execution of the synthesizer to populate all required fields. The design goal was to be robust across multiple ERC20 tokens and networks, while remaining simple to operate for developers.

**Body**  

**1. Product Scope and Objectives**  
The product is a bot-like CLI tool that generates a configuration file compatible with `examples/erc20Transfers/main.ts`. It accepts minimal user input—contract address, network, participant count, sender index, recipient index, and max iteration count—and completes the rest automatically. The output is a finalized `config.json` that contains addresses, transfer parameters, storage keys, and supporting metadata needed by the synthesizer.

**2. Data Sources and Core Workflow**  
The product relies on three sources of truth:

- **Etherscan API (v2)** to obtain the most recent successful ERC20 `transfer` transaction (`0xa9059cbb`) for the provided contract.
- **Synthesizer execution outputs**, specifically:
  - `outputs/analysis/step_log.json` to detect storage keys and keccak-based slot derivations.
  - `outputs/analysis/message_code_addresses.json` to collect invoked code addresses.
  - `outputs/instance_description.json` to detect unresolved storage key errors and decide whether further iterations are required.

The end-to-end flow is:

1) **User input** (network, contract address, participant count, indices, max iterations).  
2) **Etherscan fetch** to identify the latest successful transfer.  
3) **Populate config** (sender/recipient L1 addresses, amount, block number, tx hash, network).  
4) **Run synthesizer** via `main.ts`.  
5) **Analyze outputs** to extract:
   - `preAllocatedKeys` from SLOAD keys (including origin tracing).
   - `userStorageSlots` from KECCAK256 inputs (converted to integers).
   - `callCodeAddresses` from message code addresses.
6) **Iterate** until no new data is discovered, or storage key errors persist, or max iterations are reached.

**3. Key Logic and Heuristics**  

**(a) Transfer Selection**  
The latest successful transaction is selected from Etherscan `txlist` results, filtered to method ID `0xa9059cbb`, correct contract address, and success status. The configuration's `blockNumber` is set to one block prior to the transfer block to ensure correct simulation context.

**(b) Storage Key Extraction**  
For each SLOAD event:
- If the key fits in 4 bytes, it is recorded in `preAllocatedKeys`.
- If the key exceeds 4 bytes, the tool traces the value backward in the step log:
  - If the value originated from `PUSH32`, it is added to `preAllocatedKeys`.
  - If it originated from `KECCAK256`, the slot component (`keccak256Input[1]`) is converted to an integer and added to `userStorageSlots`.
  - Otherwise, an error is raised to surface unsupported origins.

**(c) Iteration Policy**  
The generator runs the synthesizer repeatedly until no new data is added, unless unresolved storage key errors persist in `instance_description.json`. The loop has a user-defined iteration cap; if the configuration is still not fully resolved by then, the tool throws an error.

**4. Configuration Integrity Rules**  
Several invariants are enforced:
- `callCodeAddresses[0]` is always set to `contractAddress`.
- Zero address (`0x000...000`) is filtered out from `callCodeAddresses`.
- `txNonce` is fixed to 0.
- `userStorageSlots` are stored as integers only; oversized values trigger an explicit error.
- The final output is written to `scripts/config.json`, and any temporary file is removed.

**5. Validation Across Tokens**  
The workflow was verified on multiple ERC20 tokens (TON, USDC, USDT). The design targets general ERC20 compatibility and was structured to remain extensible for broader contract types.

**Conclusion**  
`generate-erc20-config.ts` is a productized CLI tool that automates configuration generation for ERC20 transfer synthesis by combining Etherscan transaction retrieval with iterative synthesizer analysis. Its core value lies in minimizing manual configuration work, enforcing deterministic heuristics for storage key discovery, and progressively converging on a complete configuration through repeated execution. While currently specialized for ERC20 `transfer`, the architecture is intentionally modular and can be generalized to broader contract interactions in future iterations.
