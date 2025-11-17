# Browser Build Guide

This guide explains how to build and use the Synthesizer in web browsers.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build Browser Bundle

```bash
npm run build:browser
```

This creates:
- `dist/browser/synthesizer-browser.es.js` (ES Module)
- `dist/browser/synthesizer-browser.umd.js` (UMD for script tags)

### 3. Serve Circuit Files

Your web server needs to serve the QAP compiler outputs:

```
public/
└── circuits/
    ├── globalWireList.json
    ├── setupParams.json
    ├── subcircuitInfo.json
    ├── json/
    │   └── subcircuit*.json (20 files)
    └── wasm/
        └── subcircuit*.wasm (20 files)
```

Copy from: `packages/frontend/qap-compiler/subcircuits/library/`

**Total size**: ~5.2 MB

### 4. Use in Browser

#### Option A: ES Module (Modern)

```html
<script type="module">
  import { BrowserSynthesizerAdapter } from './dist/browser/synthesizer-browser.es.js';

  const synthesizer = new BrowserSynthesizerAdapter({
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
    circuitsBaseUrl: '/circuits'
  });

  await synthesizer.initialize();
  const result = await synthesizer.synthesize('0x123...');
  console.log(result.instance);
</script>
```

#### Option B: UMD (Classic)

```html
<script src="https://cdn.jsdelivr.net/npm/ethers@6/dist/ethers.umd.min.js"></script>
<script src="./dist/browser/synthesizer-browser.umd.js"></script>
<script>
  const synthesizer = new TokamakSynthesizer.BrowserSynthesizerAdapter({
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY'
  });

  synthesizer.initialize().then(() => {
    synthesizer.synthesize('0x123...').then(result => {
      console.log(result);
    });
  });
</script>
```

## Example

See `browser-example.html` for a complete working demo.

To run the example:

```bash
# 1. Build the browser bundle
npm run build:browser

# 2. Copy circuit files to public directory
mkdir -p public/circuits
cp -r ../qap-compiler/subcircuits/library/* public/circuits/

# 3. Start a local server
npm run preview:browser

# 4. Open browser-example.html
```

## API Reference

### BrowserSynthesizerAdapter

Main class for running Synthesizer in browsers.

#### Constructor

```typescript
new BrowserSynthesizerAdapter(config: SynthesizerConfig)
```

**Config**:
- `rpcUrl: string` - Ethereum JSON-RPC endpoint (required)
- `circuitsBaseUrl?: string` - Base URL for circuit files (default: `/circuits`)

#### Methods

**`initialize(): Promise<void>`**

Load all circuit resources. Must be called before `synthesize()`.

```typescript
await synthesizer.initialize();
```

**`synthesize(txHash: string): Promise<SynthesisResult>`**

Convert a transaction to circuit instance.

```typescript
const result = await synthesizer.synthesize('0x123...');
console.log(result.instance);  // Circuit instance data
console.log(result.metadata);  // Transaction metadata
```

**`isReady(): boolean`**

Check if initialized and ready.

```typescript
if (synthesizer.isReady()) {
  // Ready to synthesize
}
```

### Types

#### SynthesisResult

```typescript
interface SynthesisResult {
  instance: any;           // Circuit instance JSON
  txHash: string;          // Transaction hash
  txData: any;             // Transaction data
  metadata: {
    timestamp: number;     // Synthesis timestamp
    blockNumber: number;   // Block number
    from: string;          // Sender address
    to: string | null;     // Receiver address
  };
}
```

## Server Setup

### Express Example

```javascript
const express = require('express');
const app = express();

// Serve circuit files
app.use('/circuits', express.static('path/to/qap-compiler/subcircuits/library'));

// Serve your app
app.use(express.static('public'));

app.listen(3000);
```

### Nginx Example

```nginx
server {
  listen 80;

  location /circuits/ {
    alias /path/to/qap-compiler/subcircuits/library/;
    add_header Access-Control-Allow-Origin *;
  }

  location / {
    root /var/www/html;
  }
}
```

## Performance

- **Initial load**: ~2-3 seconds (5.2 MB of circuits, cached after first load)
- **Synthesis**: ~1-2 seconds per transaction
- **Memory**: ~50-100 MB

## CORS Considerations

If your RPC endpoint has CORS restrictions, you may need to:

1. **Use a CORS proxy** for development
2. **Set up a backend proxy** for production
3. **Use an RPC provider with CORS enabled** (e.g., Alchemy, Infura)

## Limitations

- ❌ **Proving** still requires backend (GPU-accelerated native binary)
- ❌ **Trusted Setup** requires backend
- ✅ **Synthesis** works in browser
- ✅ **Verification** works in browser (see `verify-wasm`)

## Troubleshooting

### "Failed to load WASM"

- Check that circuit files are served correctly
- Verify `circuitsBaseUrl` is correct
- Check browser console for 404 errors

### "RPC URL not configured"

- Provide a valid Ethereum RPC URL in the config
- Test the RPC URL with curl/Postman first

### Large bundle size

The browser bundle includes:
- Synthesizer logic (~500 KB)
- ethers.js (external, ~1 MB)
- Circuit files (~5.2 MB, fetched separately)

To optimize:
- Use code splitting
- Lazy load circuit files as needed
- Enable gzip/brotli compression on server

## Next Steps

- See `verify-wasm` package for browser-based verification
- Integrate with your React/Vue/Svelte app
- Set up a backend API for proving

## License

MIT OR Apache-2.0

