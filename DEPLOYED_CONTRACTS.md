# Deployed Contracts - Sepolia Testnet

Last Updated: 2024-11-24

## Core Contracts

### Verifiers

| Contract            | Address                                      |
| ------------------- | -------------------------------------------- |
| Tokamak Verifier    | `0xF680590dB955F7975AA6BA02250d11a5a2feC526` |
| Groth16 Verifier16  | `0x578aC466D5295F22939309b3F4314Af27020C3b8` |
| Groth16 Verifier32  | `0x4a0EB337004B59Af044206d2A8F52332EAB0aB46` |
| Groth16 Verifier64  | `0x75489d5FE5b7325c0f399582bd896cD5100d4687` |
| Groth16 Verifier128 | `0xdCE76C202689257c7c31fAdCfe9c1ce0931659c6` |
| ZecFrost            | `0x37A3E42C63f0dCD91133c2E514071b7705e5a9ED` |

### Implementations

| Contract                        | Address                                      |
| ------------------------------- | -------------------------------------------- |
| RollupBridge Implementation     | `0x6A7BE697F54bC6dac9cc7ab0D3B80278a6b86951` |
| Deposit Manager Implementation  | `0xa70CEdD66900FfA268Df4A58D28ad2234C5FA3Cf` |
| Proof Manager Implementation    | `0xD7f606380D5eF99722E597b94742deC828F2776f` |
| Withdraw Manager Implementation | `0x44Bff31E93F62c17E5871a34A9e6d9D78a786c82` |
| Admin Manager Implementation    | `0x717278E8d4f5afa624DB34ff3DF55197Cb0856Ac` |

### Proxies (Main Addresses to Use)

| Contract                   | Address                                      |
| -------------------------- | -------------------------------------------- |
| **RollupBridge Proxy**     | `0x780ad1b236390C42479b62F066F5cEeAa4c77ad6` |
| **Deposit Manager Proxy**  | `0x2873519dea0C8fE39e12f5E93a94B78d270F0401` |
| **Proof Manager Proxy**    | `0xd89A53b0edC82351A300a0779A6f4bA5a310f34E` |
| **Withdraw Manager Proxy** | `0x0773f8cC78eb11947ab0410e793DAfb6a479F619` |
| **Admin Manager Proxy**    | `0xbace644D6946b0DE268A56496EA20c09245D3eed` |

## Usage Notes

- **For testing and integration**: Use the **Proxy addresses**, not the implementation addresses
- **RollupBridge Proxy** is the main entry point for channel operations
- Previous test channel manager address was `0x61d4618911487c65aa49ab22db57691b4d94a6bf` (deprecated)

## Test Channel Information

**Active Test Channel**:

- **Channel ID**: 1
- **Created**: Nov-24-2025
- **Transaction**: [0x9c72d07a67f3df084e73e25d60191bc0de4ce38b9662725779a59f296ba4c00a](https://sepolia.etherscan.io/tx/0x9c72d07a67f3df084e73e25d60191bc0de4ce38b9662725779a59f296ba4c00a)
- **Leader**: 0xF9Fa94D45C49e879E46Ea783fc133F41709f3bc7
- **Participants**: 3 (Alice, Bob, Charlie)
- **Allowed Token**: 0xa30fe40285B8f5c0457DbC3B7C8A280373c40044 (TON)
- **Timeout**: 7 days (604800 seconds)
- **Public Key**: (pkx: 1, pky: 2) - Test values

## Related Files

- Test scripts: `packages/frontend/synthesizer/examples/L2StateChannel/`
- Configuration: Update `ROLLUP_BRIDGE_CORE_ADDRESS` in test files to use `0x780ad1b236390C42479b62F066F5cEeAa4c77ad6`
- Channel simulation: `onchain-channel-simulation.ts` (CHANNEL_ID = 1)

## Etherscan Links

- [RollupBridge Proxy](https://sepolia.etherscan.io/address/0x780ad1b236390C42479b62F066F5cEeAa4c77ad6)
- [Deposit Manager Proxy](https://sepolia.etherscan.io/address/0x2873519dea0C8fE39e12f5E93a94B78d270F0401)
- [Proof Manager Proxy](https://sepolia.etherscan.io/address/0xd89A53b0edC82351A300a0779A6f4bA5a310f34E)
- [Withdraw Manager Proxy](https://sepolia.etherscan.io/address/0x0773f8cC78eb11947ab0410e793DAfb6a479F619)
- [Admin Manager Proxy](https://sepolia.etherscan.io/address/0xbace644D6946b0DE268A56496EA20c09245D3eed)
