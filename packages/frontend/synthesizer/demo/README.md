# Tokamak Synthesizer - Demo & Testing Environment

This directory contains browser demo and testing tools for the Tokamak Synthesizer.

## 🎯 Purpose

- **Demo Server**: Interactive web UI for testing the Synthesizer
- **Adapter Tests**: Standalone test scripts for SynthesizerAdapter

This code is **separate from the core Synthesizer** to keep dependencies clean.

---

## 📁 Structure

```
demo/
├── package.json         # Demo-specific dependencies
├── server.ts            # Express demo server with web UI
├── test-adapter.ts      # CLI test script for adapter
└── README.md           # This file
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd demo
npm install
```

### 2. Configure RPC

Create a `.env` file in the **project root** (`Tokamak-zk-EVM/.env`):

```env
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
NODE_TLS_REJECT_UNAUTHORIZED=0  # For development only
```

### 3. Run Demo Server

```bash
npm run dev
```

Then open your browser to: **http://localhost:3000**

### 4. Test Adapter (CLI)

```bash
npm run test:adapter
```

---

## 📦 Dependencies

### Core Dependencies
- `@tokamak-zk-evm/synthesizer` - The synthesizer package (workspace link)
- `express` - Web server
- `cors` - CORS handling
- `dotenv` - Environment variables
- `ethers` - Ethereum RPC interactions

### Dev Dependencies
- `tsx` - TypeScript execution
- `vite` - Browser bundling (if needed)
- `typescript` - Type checking

---

## 🌐 Demo Server API

### `POST /api/synthesize`

Synthesize a transaction into circuit inputs.

**Request:**
```json
{
  "txHash": "0x...",
  "rpcUrl": "https://..." // Optional, uses env if not provided
}
```

**Response:**
```json
{
  "success": true,
  "duration": 45.2,
  "result": {
    "instance": {
      "a_pub_length": 64,
      "a_pub_first": "0x...",
      "a_pub_last": "0x...",
      "a_pub_sample": ["0x...", ...]
    },
    "placementVariablesCount": 150,
    "permutationCount": 200,
    "metadata": {
      "txHash": "0x...",
      "blockNumber": 12345678,
      "from": "0x...",
      "to": "0x...",
      "contractAddress": "0x...",
      "eoaAddresses": ["0x...", "0x..."]
    }
  }
}
```

### `GET /api/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "rpcConfigured": true,
  "timestamp": "2025-11-17T..."
}
```

---

## 🧪 Test Examples

### Example Transaction

TON Transfer Transaction (Mainnet):
```
0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41
```

This transaction is pre-filled in the demo UI for quick testing.

---

## 🛠️ Development

### Adding New Tests

Create new test scripts in this directory:

```typescript
// my-test.ts
import { SynthesizerAdapter } from '@tokamak-zk-evm/synthesizer';

async function myTest() {
  const adapter = new SynthesizerAdapter({ rpcUrl: process.env.RPC_URL! });
  const result = await adapter.synthesize('0x...');
  console.log(result);
}

myTest();
```

Run with:
```bash
tsx my-test.ts
```

### Modifying the Server

Edit `server.ts` to:
- Add new API endpoints
- Change the UI
- Add more features

Restart the server after changes:
```bash
npm run dev
```

---

## 📝 Notes

### Why Separate `demo/` Folder?

The core Synthesizer package should be **lightweight and dependency-free** for production use. Browser-specific tools and testing utilities are kept here to:

1. **Clean Dependencies**: Core package doesn't need `express`, `cors`, etc.
2. **Optional Installation**: Developers can skip demo if not needed
3. **Clear Separation**: Testing/demo code vs. production code

### SSL Certificate Issues

If you encounter SSL certificate errors, set:
```env
NODE_TLS_REJECT_UNAUTHORIZED=0
```

⚠️ **Use only for development/testing!**

### Workspace Dependencies

This package uses workspace linking to the core Synthesizer:

```json
{
  "dependencies": {
    "@tokamak-zk-evm/synthesizer": "workspace:*"
  }
}
```

Ensure you've built the core package first:
```bash
cd ..
npm run build
```

---

## 🐛 Troubleshooting

### "RPC URL is required"

- Check `.env` file exists in **project root** (`Tokamak-zk-EVM/.env`)
- Verify `RPC_URL` is set

### "Cannot find module '@tokamak-zk-evm/synthesizer'"

- Build the core package first: `cd .. && npm run build`
- Re-install dependencies: `npm install`

### "unable to get local issuer certificate"

- Add `NODE_TLS_REJECT_UNAUTHORIZED=0` to `.env`
- Or use a properly configured RPC URL

### Port 3000 already in use

Change the port in `server.ts`:
```typescript
const PORT = 3001; // or any other available port
```

---

## 📚 Related Documentation

- [Core Synthesizer README](../README.md)
- [State Channel Specification](../STATE_CHANNEL_SPECIFICATION.md)
- [Synthesizer Documentation](https://tokamak.notion.site/Synthesizer-documentation-164d96a400a3808db0f0f636e20fca24)

---

## 📧 Support

For issues or questions, please open an issue on GitHub:
https://github.com/tokamak-network/tokamak-zk-evm/issues

