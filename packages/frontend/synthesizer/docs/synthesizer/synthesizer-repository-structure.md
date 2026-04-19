# Synthesizer Repository Structure

This document reflects the current Git-tracked tree of `packages/frontend/synthesizer/`.
Generated or untracked directories such as `dist/`, `node_modules/`, runtime outputs, and local developer artifacts are intentionally excluded.

```text
synthesizer/
├── .vscode
│   ├── launch.json
│   └── web-app-debug.ts
├── core
│   └── src
│       ├── app
│       │   ├── serialization.ts
│       │   ├── subcircuitLibrary.ts
│       │   ├── synthesize.ts
│       │   └── types.ts
│       ├── circuitGenerator
│       │   ├── handlers
│       │   │   ├── permutationGenerator.ts
│       │   │   └── variableGenerator.ts
│       │   ├── types
│       │   │   └── types.ts
│       │   ├── utils
│       │   │   └── witness_calculator.ts
│       │   └── circuitGenerator.ts
│       ├── subcircuit
│       │   ├── configuredTypes.ts
│       │   ├── libraryTypes.ts
│       │   └── utils.ts
│       ├── synthesizer
│       │   ├── dataStructure
│       │   │   ├── arithmeticOperations.ts
│       │   │   ├── dataPt.ts
│       │   │   ├── index.ts
│       │   │   ├── memoryPt.ts
│       │   │   └── stackPt.ts
│       │   ├── handlers
│       │   │   ├── arithmeticManager.ts
│       │   │   ├── bufferManager.ts
│       │   │   ├── index.ts
│       │   │   ├── instructionHandler.ts
│       │   │   ├── memoryManager.ts
│       │   │   └── stateManager.ts
│       │   ├── params
│       │   │   └── constants.ts
│       │   ├── types
│       │   │   ├── buffers.ts
│       │   │   ├── dataStructure.ts
│       │   │   ├── index.ts
│       │   │   ├── instructions.ts
│       │   │   ├── placements.ts
│       │   │   └── synthesizer.ts
│       │   ├── constructors.ts
│       │   └── synthesizer.ts
│       ├── app.ts
│       ├── circuit.ts
│       ├── index.ts
│       ├── subcircuit.ts
│       └── synthesizer.ts
├── docs
│   └── synthesizer
│       ├── synthesizer-architecture.md
│       ├── synthesizer-class-structure.md
│       ├── synthesizer-code-examples.md
│       ├── synthesizer-data-structure.md
│       ├── synthesizer-dual-target-packaging.md
│       ├── synthesizer-execution-flow.md
│       ├── synthesizer-introduction.md
│       ├── synthesizer-opcodes.md
│       ├── synthesizer-output-files.md
│       ├── synthesizer-repository-structure.md
│       ├── synthesizer-terminology.md
│       ├── synthesizer-transaction-flow.md
│       └── synthesizer.md
├── node-cli
│   ├── .githooks
│   │   └── pre-commit
│   ├── .vscode
│   │   └── launch.json
│   ├── examples
│   │   ├── L2StateChannel
│   │   │   ├── block_info.json
│   │   │   ├── contract_codes.json
│   │   │   ├── previous_state_snapshot.json
│   │   │   └── transaction.json
│   │   ├── erc20Transfers
│   │   │   ├── ton
│   │   │   │   ├── config-ton-1.json
│   │   │   │   ├── config-ton-2.json
│   │   │   │   ├── config-ton-3.json
│   │   │   │   ├── config-ton-4.json
│   │   │   │   └── config-ton-sepolia.json
│   │   │   ├── usdc
│   │   │   │   ├── config-usdc-1.json
│   │   │   │   ├── config-usdc-2.json
│   │   │   │   ├── config-usdc-3.json
│   │   │   │   ├── config-usdc-4.json
│   │   │   │   └── config-usdc-sepolia.json
│   │   │   ├── usdt
│   │   │   │   ├── config-usdt-1.json
│   │   │   │   ├── config-usdt-2.json
│   │   │   │   ├── config-usdt-3.json
│   │   │   │   ├── config-usdt-4.json
│   │   │   │   └── config-usdt-sepolia.json
│   │   │   └── utils.ts
│   │   ├── privateState
│   │   │   ├── mintNotes
│   │   │   │   ├── mintNotes1
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── mintNotes2
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── mintNotes3
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── mintNotes4
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── mintNotes5
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── mintNotes6
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── README.md
│   │   │   │   └── cli-launch-manifest.json
│   │   │   ├── redeemNotes
│   │   │   │   ├── redeemNotes1
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── redeemNotes2
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── redeemNotes3
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── redeemNotes4
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── README.md
│   │   │   │   └── cli-launch-manifest.json
│   │   │   ├── transferNotes
│   │   │   │   ├── transferNotes1To1
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── transferNotes1To2
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── transferNotes1To3
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── transferNotes2To1
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── transferNotes2To2
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── transferNotes3To1
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── transferNotes3To2
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── transferNotes4To1
│   │   │   │   │   ├── block_info.json
│   │   │   │   │   ├── contract_codes.json
│   │   │   │   │   ├── previous_state_snapshot.json
│   │   │   │   │   └── transaction.json
│   │   │   │   ├── README.md
│   │   │   │   └── cli-launch-manifest.json
│   │   │   └── utils.ts
│   │   ├── config-runner.ts
│   │   └── manifest-runner.ts
│   ├── scripts
│   │   ├── deployment
│   │   │   └── private-state
│   │   │       ├── deployment.11155111.latest.json
│   │   │       ├── deployment.31337.latest.json
│   │   │       ├── storage-layout.11155111.latest.json
│   │   │       └── storage-layout.31337.latest.json
│   │   ├── utils
│   │   │   └── private-state.ts
│   │   ├── .env.example
│   │   ├── build-package.mjs
│   │   ├── config.json
│   │   ├── export-phase1-comparison.sh
│   │   ├── generate-erc20-config.ts
│   │   ├── generate-private-state-mint-config.ts
│   │   ├── generate-private-state-redeem-config.ts
│   │   └── generate-private-state-transfer-config.ts
│   ├── src
│   │   ├── cli
│   │   │   ├── utils
│   │   │   │   └── node.ts
│   │   │   ├── index.ts
│   │   │   └── tokamakChTx.ts
│   │   ├── io
│   │   │   └── jsonWriter.ts
│   │   ├── subcircuit
│   │   │   ├── installedLibrary.ts
│   │   │   └── wasmLoader.ts
│   │   ├── synthesizer
│   │   │   └── constructors.ts
│   │   └── index.ts
│   ├── tests
│   │   ├── configs
│   │   │   ├── private-state-mint
│   │   │   │   ├── config-anvil-private-state-mint-m1-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-mint-m2-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-mint-m3-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-mint-m4-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-mint-m5-p4-s0.json
│   │   │   │   └── config-anvil-private-state-mint-m6-p4-s0.json
│   │   │   ├── private-state-redeem
│   │   │   │   ├── config-anvil-private-state-redeem-n1-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-redeem-n1-p4-s1.json
│   │   │   │   ├── config-anvil-private-state-redeem-n1-p4-s2.json
│   │   │   │   ├── config-anvil-private-state-redeem-n1-p4-s3.json
│   │   │   │   ├── config-anvil-private-state-redeem-n2-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-redeem-n3-p4-s0.json
│   │   │   │   └── config-anvil-private-state-redeem-n4-p4-s0.json
│   │   │   ├── private-state-transfer
│   │   │   │   ├── config-anvil-private-state-transfer-n1-m1-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-transfer-n1-m2-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-transfer-n1-m3-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-transfer-n2-m1-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-transfer-n2-m2-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-transfer-n3-m1-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-transfer-n3-m2-p4-s0.json
│   │   │   │   └── config-anvil-private-state-transfer-n4-m1-p4-s0.json
│   │   │   ├── config-mainnet-p4-i10-2be5e8c109e2197d077d13a82daead6a9b3433c5-s0-r3.json
│   │   │   ├── config-mainnet-p4-i10-2be5e8c109e2197d077d13a82daead6a9b3433c5-s1-r2.json
│   │   │   ├── config-mainnet-p4-i10-2be5e8c109e2197d077d13a82daead6a9b3433c5-s2-r1.json
│   │   │   ├── config-mainnet-p4-i10-2be5e8c109e2197d077d13a82daead6a9b3433c5-s3-r0.json
│   │   │   ├── config-mainnet-p4-i10-a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-s0-r3.json
│   │   │   ├── config-mainnet-p4-i10-a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-s1-r2.json
│   │   │   ├── config-mainnet-p4-i10-a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-s2-r1.json
│   │   │   ├── config-mainnet-p4-i10-a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-s3-r0.json
│   │   │   ├── config-mainnet-p4-i10-dac17f958d2ee523a2206206994597c13d831ec7-s0-r3.json
│   │   │   ├── config-mainnet-p4-i10-dac17f958d2ee523a2206206994597c13d831ec7-s1-r2.json
│   │   │   ├── config-mainnet-p4-i10-dac17f958d2ee523a2206206994597c13d831ec7-s2-r1.json
│   │   │   ├── config-mainnet-p4-i10-dac17f958d2ee523a2206206994597c13d831ec7-s3-r0.json
│   │   │   ├── config-sepolia-p4-i10-1c7d4b196cb0c7b01d743fbc6116a902379c7238-s0-r3.json
│   │   │   ├── config-sepolia-p4-i10-1c7d4b196cb0c7b01d743fbc6116a902379c7238-s1-r2.json
│   │   │   ├── config-sepolia-p4-i10-1c7d4b196cb0c7b01d743fbc6116a902379c7238-s2-r1.json
│   │   │   ├── config-sepolia-p4-i10-1c7d4b196cb0c7b01d743fbc6116a902379c7238-s3-r0.json
│   │   │   ├── config-sepolia-p4-i10-42d3b260c761cd5da022db56fe2f89c4a909b04a-s0-r3.json
│   │   │   ├── config-sepolia-p4-i10-42d3b260c761cd5da022db56fe2f89c4a909b04a-s1-r2.json
│   │   │   ├── config-sepolia-p4-i10-42d3b260c761cd5da022db56fe2f89c4a909b04a-s2-r1.json
│   │   │   ├── config-sepolia-p4-i10-42d3b260c761cd5da022db56fe2f89c4a909b04a-s3-r0.json
│   │   │   ├── config-sepolia-p4-i10-a30fe40285b8f5c0457dbc3b7c8a280373c40044-s0-r3.json
│   │   │   ├── config-sepolia-p4-i10-a30fe40285b8f5c0457dbc3b7c8a280373c40044-s1-r2.json
│   │   │   ├── config-sepolia-p4-i10-a30fe40285b8f5c0457dbc3b7c8a280373c40044-s2-r1.json
│   │   │   └── config-sepolia-p4-i10-a30fe40285b8f5c0457dbc3b7c8a280373c40044-s3-r0.json
│   │   └── scripts
│   │       ├── run-erc20-config-matrix.ts
│   │       ├── run-erc20-main-from-configs.ts
│   │       ├── run-private-state-mint-config-matrix.ts
│   │       ├── run-private-state-mint-main-from-configs.ts
│   │       ├── run-private-state-redeem-config-matrix.ts
│   │       ├── run-private-state-redeem-main-from-configs.ts
│   │       ├── run-private-state-transfer-config-matrix.ts
│   │       └── run-private-state-transfer-main-from-configs.ts
│   ├── .eslintignore
│   ├── .eslintrc.cjs
│   ├── BINARY_USAGE.md
│   ├── LICENSE-APACHE
│   ├── LICENSE-MIT
│   ├── NOTICE
│   ├── README.md
│   ├── build-binary.sh
│   ├── package-lock.json
│   ├── package.json
│   ├── tsconfig.dev.json
│   ├── tsconfig.json
│   ├── tsconfig.lint.json
│   ├── tsconfig.prod.cjs.json
│   └── tsconfig.prod.esm.json
├── web-app
│   ├── scripts
│   │   ├── build-package.mjs
│   │   └── generate-bundled-subcircuit-module.mjs
│   ├── src
│   │   ├── input
│   │   │   └── index.ts
│   │   ├── output
│   │   │   └── index.ts
│   │   ├── subcircuit
│   │   │   ├── bundled.generated.ts
│   │   │   └── index.ts
│   │   ├── index.ts
│   │   ├── synthesize.ts
│   │   ├── types.ts
│   │   └── wasm.d.ts
│   ├── LICENSE-APACHE
│   ├── LICENSE-MIT
│   ├── NOTICE
│   ├── README.md
│   ├── package-lock.json
│   ├── package.json
│   └── tsconfig.json
├── .gitignore
├── .prettierignore
├── LICENSE-APACHE
├── LICENSE-MIT
├── NOTICE
├── README.md
├── package-lock.json
├── package.json
└── tsconfig.tsbuildinfo
```
│       ├── synthesizer-code-examples.md
│       ├── synthesizer-data-structure.md
│       ├── synthesizer-dual-target-packaging.md
│       ├── synthesizer-execution-flow.md
│       ├── synthesizer-introduction.md
│       ├── synthesizer-opcodes.md
│       ├── synthesizer-output-files.md
│       ├── synthesizer-repository-structure.md
│       ├── synthesizer-terminology.md
│       ├── synthesizer-transaction-flow.md
│       └── synthesizer.md
├── node-cli
│   ├── .eslintignore
│   ├── .eslintrc.cjs
│   ├── .githooks
│   │   └── pre-commit
│   ├── .vscode
│   │   └── launch.json
│   ├── BINARY_USAGE.md
│   ├── LICENSE-APACHE
│   ├── LICENSE-MIT
│   ├── NOTICE
│   ├── README.md
│   ├── build-binary.sh
│   ├── examples
│   │   ├── config-runner.ts
│   │   ├── L2StateChannel
│   │   │   ├── block_info.json
│   │   │   ├── contract_codes.json
│   │   │   ├── previous_state_snapshot.json
│   │   │   └── transaction.json
│   │   ├── erc20Transfers
│   │   │   ├── ton
│   │   │   │   ├── config-ton-1.json
│   │   │   │   ├── config-ton-2.json
│   │   │   │   ├── config-ton-3.json
│   │   │   │   ├── config-ton-4.json
│   │   │   │   └── config-ton-sepolia.json
│   │   │   ├── usdc
│   │   │   │   ├── config-usdc-1.json
│   │   │   │   ├── config-usdc-2.json
│   │   │   │   ├── config-usdc-3.json
│   │   │   │   ├── config-usdc-4.json
│   │   │   │   └── config-usdc-sepolia.json
│   │   │   ├── usdt
│   │   │   │   ├── config-usdt-1.json
│   │   │   │   ├── config-usdt-2.json
│   │   │   │   ├── config-usdt-3.json
│   │   │   │   ├── config-usdt-4.json
│   │   │   │   └── config-usdt-sepolia.json
│   │   │   └── utils.ts
│   │   ├── manifest-runner.ts
│   │   └── privateState
│   │       ├── mintNotes
│   │       │   ├── README.md
│   │       │   ├── cli-launch-manifest.json
│   │       │   ├── mintNotes1
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   ├── mintNotes2
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   ├── mintNotes3
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   ├── mintNotes4
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   ├── mintNotes5
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   ├── mintNotes6
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   └── utils.ts
│   │       ├── redeemNotes
│   │       │   ├── README.md
│   │       │   ├── cli-launch-manifest.json
│   │       │   ├── redeemNotes1
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   ├── redeemNotes2
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   ├── redeemNotes3
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   ├── redeemNotes4
│   │       │   │   ├── block_info.json
│   │       │   │   ├── contract_codes.json
│   │       │   │   ├── previous_state_snapshot.json
│   │       │   │   └── transaction.json
│   │       │   └── utils.ts
│   │       └── transferNotes
│   │           ├── README.md
│   │           ├── cli-launch-manifest.json
│   │           ├── transferNotes1To1
│   │           │   ├── block_info.json
│   │           │   ├── contract_codes.json
│   │           │   ├── previous_state_snapshot.json
│   │           │   └── transaction.json
│   │           ├── transferNotes1To2
│   │           │   ├── block_info.json
│   │           │   ├── contract_codes.json
│   │           │   ├── previous_state_snapshot.json
│   │           │   └── transaction.json
│   │           ├── transferNotes1To3
│   │           │   ├── block_info.json
│   │           │   ├── contract_codes.json
│   │           │   ├── previous_state_snapshot.json
│   │           │   └── transaction.json
│   │           ├── transferNotes2To1
│   │           │   ├── block_info.json
│   │           │   ├── contract_codes.json
│   │           │   ├── previous_state_snapshot.json
│   │           │   └── transaction.json
│   │           ├── transferNotes2To2
│   │           │   ├── block_info.json
│   │           │   ├── contract_codes.json
│   │           │   ├── previous_state_snapshot.json
│   │           │   └── transaction.json
│   │           ├── transferNotes3To1
│   │           │   ├── block_info.json
│   │           │   ├── contract_codes.json
│   │           │   ├── previous_state_snapshot.json
│   │           │   └── transaction.json
│   │           ├── transferNotes3To2
│   │           │   ├── block_info.json
│   │           │   ├── contract_codes.json
│   │           │   ├── previous_state_snapshot.json
│   │           │   └── transaction.json
│   │           ├── transferNotes4To1
│   │           │   ├── block_info.json
│   │           │   ├── contract_codes.json
│   │           │   ├── previous_state_snapshot.json
│   │           │   └── transaction.json
│   │           └── utils.ts
│   ├── package-lock.json
│   ├── package.json
│   ├── scripts
│   │   ├── .env.example
│   │   ├── build-package.mjs
│   │   ├── config.json
│   │   ├── deployment
│   │   │   └── private-state
│   │   │       ├── deployment.11155111.latest.json
│   │   │       ├── deployment.31337.latest.json
│   │   │       ├── storage-layout.11155111.latest.json
│   │   │       └── storage-layout.31337.latest.json
│   │   ├── export-phase1-comparison.sh
│   │   ├── generate-erc20-config.ts
│   │   ├── generate-private-state-mint-config.ts
│   │   ├── generate-private-state-redeem-config.ts
│   │   ├── generate-private-state-transfer-config.ts
│   │   └── utils
│   │       └── private-state.ts
│   ├── src
│   │   ├── cli
│   │   │   ├── index.ts
│   │   │   └── utils
│   │   │       └── node.ts
│   │   ├── index.ts
│   │   ├── io
│   │   │   ├── env.ts
│   │   │   └── jsonWriter.ts
│   │   ├── rpc
│   │   │   ├── index.ts
│   │   │   └── types.ts
│   │   ├── subcircuit
│   │   │   ├── installedLibrary.ts
│   │   │   └── wasmLoader.ts
│   │   └── synthesizer
│   │       └── constructors.ts
│   ├── tests
│   │   ├── configs
│   │   │   ├── config-mainnet-p4-i10-2be5e8c109e2197d077d13a82daead6a9b3433c5-s0-r3.json
│   │   │   ├── config-mainnet-p4-i10-2be5e8c109e2197d077d13a82daead6a9b3433c5-s1-r2.json
│   │   │   ├── config-mainnet-p4-i10-2be5e8c109e2197d077d13a82daead6a9b3433c5-s2-r1.json
│   │   │   ├── config-mainnet-p4-i10-2be5e8c109e2197d077d13a82daead6a9b3433c5-s3-r0.json
│   │   │   ├── config-mainnet-p4-i10-a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-s0-r3.json
│   │   │   ├── config-mainnet-p4-i10-a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-s1-r2.json
│   │   │   ├── config-mainnet-p4-i10-a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-s2-r1.json
│   │   │   ├── config-mainnet-p4-i10-a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-s3-r0.json
│   │   │   ├── config-mainnet-p4-i10-dac17f958d2ee523a2206206994597c13d831ec7-s0-r3.json
│   │   │   ├── config-mainnet-p4-i10-dac17f958d2ee523a2206206994597c13d831ec7-s1-r2.json
│   │   │   ├── config-mainnet-p4-i10-dac17f958d2ee523a2206206994597c13d831ec7-s2-r1.json
│   │   │   ├── config-mainnet-p4-i10-dac17f958d2ee523a2206206994597c13d831ec7-s3-r0.json
│   │   │   ├── config-sepolia-p4-i10-1c7d4b196cb0c7b01d743fbc6116a902379c7238-s0-r3.json
│   │   │   ├── config-sepolia-p4-i10-1c7d4b196cb0c7b01d743fbc6116a902379c7238-s1-r2.json
│   │   │   ├── config-sepolia-p4-i10-1c7d4b196cb0c7b01d743fbc6116a902379c7238-s2-r1.json
│   │   │   ├── config-sepolia-p4-i10-1c7d4b196cb0c7b01d743fbc6116a902379c7238-s3-r0.json
│   │   │   ├── config-sepolia-p4-i10-42d3b260c761cd5da022db56fe2f89c4a909b04a-s0-r3.json
│   │   │   ├── config-sepolia-p4-i10-42d3b260c761cd5da022db56fe2f89c4a909b04a-s1-r2.json
│   │   │   ├── config-sepolia-p4-i10-42d3b260c761cd5da022db56fe2f89c4a909b04a-s2-r1.json
│   │   │   ├── config-sepolia-p4-i10-42d3b260c761cd5da022db56fe2f89c4a909b04a-s3-r0.json
│   │   │   ├── config-sepolia-p4-i10-a30fe40285b8f5c0457dbc3b7c8a280373c40044-s0-r3.json
│   │   │   ├── config-sepolia-p4-i10-a30fe40285b8f5c0457dbc3b7c8a280373c40044-s1-r2.json
│   │   │   ├── config-sepolia-p4-i10-a30fe40285b8f5c0457dbc3b7c8a280373c40044-s2-r1.json
│   │   │   ├── config-sepolia-p4-i10-a30fe40285b8f5c0457dbc3b7c8a280373c40044-s3-r0.json
│   │   │   ├── private-state-mint
│   │   │   │   ├── config-anvil-private-state-mint-m1-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-mint-m2-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-mint-m3-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-mint-m4-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-mint-m5-p4-s0.json
│   │   │   │   └── config-anvil-private-state-mint-m6-p4-s0.json
│   │   │   ├── private-state-redeem
│   │   │   │   ├── config-anvil-private-state-redeem-n1-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-redeem-n1-p4-s1.json
│   │   │   │   ├── config-anvil-private-state-redeem-n1-p4-s2.json
│   │   │   │   ├── config-anvil-private-state-redeem-n1-p4-s3.json
│   │   │   │   ├── config-anvil-private-state-redeem-n2-p4-s0.json
│   │   │   │   ├── config-anvil-private-state-redeem-n3-p4-s0.json
│   │   │   │   └── config-anvil-private-state-redeem-n4-p4-s0.json
│   │   │   └── private-state-transfer
│   │   │       ├── config-anvil-private-state-transfer-n1-m1-p4-s0.json
│   │   │       ├── config-anvil-private-state-transfer-n1-m2-p4-s0.json
│   │   │       ├── config-anvil-private-state-transfer-n1-m3-p4-s0.json
│   │   │       ├── config-anvil-private-state-transfer-n2-m1-p4-s0.json
│   │   │       ├── config-anvil-private-state-transfer-n2-m2-p4-s0.json
│   │   │       ├── config-anvil-private-state-transfer-n3-m1-p4-s0.json
│   │   │       ├── config-anvil-private-state-transfer-n3-m2-p4-s0.json
│   │   │       └── config-anvil-private-state-transfer-n4-m1-p4-s0.json
│   │   └── scripts
│   │       ├── run-erc20-config-matrix.ts
│   │       ├── run-erc20-main-from-configs.ts
│   │       ├── run-private-state-mint-config-matrix.ts
│   │       ├── run-private-state-mint-main-from-configs.ts
│   │       ├── run-private-state-redeem-config-matrix.ts
│   │       ├── run-private-state-redeem-main-from-configs.ts
│   │       ├── run-private-state-transfer-config-matrix.ts
│   │       └── run-private-state-transfer-main-from-configs.ts
│   ├── tsconfig.dev.json
│   ├── tsconfig.json
│   ├── tsconfig.lint.json
│   ├── tsconfig.prod.cjs.json
│   └── tsconfig.prod.esm.json
├── tsconfig.tsbuildinfo
└── web-app
    ├── LICENSE-APACHE
    ├── LICENSE-MIT
    ├── NOTICE
    ├── README.md
    ├── package-lock.json
    ├── package.json
    ├── scripts
    │   └── build-package.mjs
    ├── src
    │   ├── index.ts
    │   ├── input
    │   │   └── index.ts
    │   ├── output
    │   │   └── index.ts
    │   ├── subcircuit
    │   │   └── index.ts
    │   ├── synthesize.ts
    │   └── types.ts
    └── tsconfig.json
```
