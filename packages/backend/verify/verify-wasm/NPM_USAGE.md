# Tokamak zkEVM Verify-WASM - NPM Usage Guide

Fast SNARK verification in browsers and Node.js using WebAssembly.

## 📦 Installation

### For Browsers (Web)

```bash
npm install @tokamak-network/zkevm-verify-wasm-web
```

### For Node.js

```bash
npm install @tokamak-network/zkevm-verify-wasm-nodejs
```

### For Webpack/Rollup (Bundlers)

```bash
npm install @tokamak-network/zkevm-verify-wasm-bundler
```

---

## 🚀 Quick Start

### Browser (Vanilla JS)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Tokamak zkEVM Verifier</title>
</head>
<body>
    <button id="verifyBtn">Verify Proof</button>
    <div id="result"></div>

    <script type="module">
        import init, { verify_snark } from '@tokamak-network/zkevm-verify-wasm-web';

        async function verify() {
            // Initialize WASM (only once)
            await init();
            
            // Load your proof data
            const proof = await fetch('/data/proof.json').then(r => r.json());
            const preprocess = await fetch('/data/preprocess.json').then(r => r.json());
            const setupParams = await fetch('/data/setupParams.json').then(r => r.json());
            const sigmaVerify = await fetch('/data/sigma_verify.json').then(r => r.json());
            const instance = await fetch('/data/instance.json').then(r => r.json());
            
            // Verify (takes 2-5 seconds)
            const result = verify_snark(
                proof,
                preprocess,
                setupParams,
                sigmaVerify,
                instance
            );
            
            document.getElementById('result').textContent = 
                result ? '✅ Proof Valid!' : '❌ Proof Invalid!';
        }
        
        document.getElementById('verifyBtn').onclick = verify;
    </script>
</body>
</html>
```

### Node.js

```javascript
import { verify_snark } from '@tokamak-network/zkevm-verify-wasm-nodejs';
import { readFileSync } from 'fs';

// Load data
const proof = JSON.parse(readFileSync('data/proof.json', 'utf-8'));
const preprocess = JSON.parse(readFileSync('data/preprocess.json', 'utf-8'));
const setupParams = JSON.parse(readFileSync('data/setupParams.json', 'utf-8'));
const sigmaVerify = JSON.parse(readFileSync('data/sigma_verify.json', 'utf-8'));
const instance = JSON.parse(readFileSync('data/instance.json', 'utf-8'));

// Verify
console.time('Verification');
const result = verify_snark(
    proof,
    preprocess,
    setupParams,
    sigmaVerify,
    instance
);
console.timeEnd('Verification');

console.log(result ? '✅ Proof Valid!' : '❌ Proof Invalid!');
```

### React

```jsx
import { useEffect, useState } from 'react';
import init, { verify_snark } from '@tokamak-network/zkevm-verify-wasm-web';

function ProofVerifier() {
    const [initialized, setInitialized] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        // Initialize WASM on component mount
        init().then(() => setInitialized(true));
    }, []);

    const handleVerify = async () => {
        if (!initialized) return;
        
        setVerifying(true);
        try {
            // Load data
            const proof = await fetch('/data/proof.json').then(r => r.json());
            const preprocess = await fetch('/data/preprocess.json').then(r => r.json());
            const setupParams = await fetch('/data/setupParams.json').then(r => r.json());
            const sigmaVerify = await fetch('/data/sigma_verify.json').then(r => r.json());
            const instance = await fetch('/data/instance.json').then(r => r.json());
            
            // Verify
            const isValid = verify_snark(
                proof,
                preprocess,
                setupParams,
                sigmaVerify,
                instance
            );
            
            setResult(isValid);
        } catch (error) {
            console.error('Verification failed:', error);
            setResult(false);
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div>
            <button 
                onClick={handleVerify} 
                disabled={!initialized || verifying}
            >
                {verifying ? 'Verifying...' : 'Verify Proof'}
            </button>
            
            {result !== null && (
                <div>
                    {result ? '✅ Proof Valid!' : '❌ Proof Invalid!'}
                </div>
            )}
        </div>
    );
}
```

### Next.js

```jsx
// pages/verify.js
import dynamic from 'next/dynamic';

// Dynamically import to avoid SSR issues
const VerifyComponent = dynamic(
    () => import('../components/ProofVerifier'),
    { ssr: false }
);

export default function VerifyPage() {
    return <VerifyComponent />;
}
```

---

## 📚 API Reference

### `verify_snark(proof, preprocess, setupParams, sigmaVerify, instance): boolean`

Verifies a SNARK proof.

**Parameters:**
- `proof`: Proof object (from prover)
- `preprocess`: Preprocessed data
- `setupParams`: Setup parameters
- `sigmaVerify`: Verification key (sigma)
- `instance`: Public inputs

**Returns:** `true` if valid, `false` if invalid

**Performance:** 2-5 seconds (browser), 3-4 seconds (Node.js)

---

## 🎯 Data Format

All input data should be JSON objects. Example structure:

### proof.json
```json
{
  "A": { "x": "0x...", "y": "0x..." },
  "B": { "x": ["0x...", "0x..."], "y": ["0x...", "0x..."] },
  "C": { "x": "0x...", "y": "0x..." },
  ...
}
```

### preprocess.json
```json
{
  "v_s_x": { "x": "0x...", "y": "0x..." },
  "v_s_y": { "x": "0x...", "y": "0x..." },
  ...
}
```

See the [example data](./data/) directory for complete examples.

---

## ⚡ Performance

| Environment | Time | Memory |
|-------------|------|--------|
| Chrome (Desktop) | 2-3s | ~100MB |
| Firefox (Desktop) | 2-4s | ~120MB |
| Safari (Desktop) | 3-5s | ~110MB |
| Node.js 18+ | 3-4s | ~150MB |
| Mobile (Chrome) | 5-8s | ~150MB |

---

## 🔧 TypeScript Support

Full TypeScript support included!

```typescript
import init, { verify_snark } from '@tokamak-network/zkevm-verify-wasm-web';

interface Proof {
    A: { x: string; y: string };
    B: { x: [string, string]; y: [string, string] };
    C: { x: string; y: string };
    // ...
}

const proof: Proof = await fetch('/data/proof.json').then(r => r.json());

await init();
const result: boolean = verify_snark(
    proof,
    preprocess,
    setupParams,
    sigmaVerify,
    instance
);
```

---

## 🐛 Troubleshooting

### "Module not found"

Make sure you're using the correct package for your environment:
- Browser: `@tokamak-network/zkevm-verify-wasm-web`
- Node.js: `@tokamak-network/zkevm-verify-wasm-nodejs`
- Bundler: `@tokamak-network/zkevm-verify-wasm-bundler`

### "WASM file not found" (in browsers)

Make sure your bundler is configured to handle `.wasm` files:

**Webpack:**
```javascript
// webpack.config.js
module.exports = {
    experiments: {
        asyncWebAssembly: true
    }
};
```

**Vite:**
```javascript
// vite.config.js
export default {
    plugins: [
        // Vite handles WASM automatically
    ]
};
```

### "init() never completes"

Check browser console for CORS errors. WASM files must be served with correct MIME type:
```
Content-Type: application/wasm
```

### Slow verification (>10 seconds)

Check:
1. Are you on mobile? (Mobile is 2-3x slower)
2. Is the browser tab in background? (Some browsers throttle)
3. Are you in dev mode? (Use production build)

---

## 📊 Size

| Package | WASM Size | Total Size |
|---------|-----------|------------|
| Web | ~2.1 MB | ~2.2 MB |
| Node.js | ~2.1 MB | ~2.2 MB |
| Bundler | ~2.1 MB | ~2.2 MB |

**Note:** Actual download size with gzip compression: ~600-700 KB

---

## 🔐 Security

This package performs cryptographic verification of zero-knowledge proofs using:
- BLS12-381 elliptic curve pairing
- Keccak-256 hashing
- Arkworks cryptography library

**Important:** Always verify proofs from untrusted sources!

---

## 📝 License

MIT License - see LICENSE file for details

---

## 🔗 Links

- [GitHub Repository](https://github.com/tokamak-network/Tokamak-zk-EVM)
- [Documentation](https://tokamak.notion.site/)
- [Tokamak Network](https://tokamak.network/)

---

## 💬 Support

- Issues: [GitHub Issues](https://github.com/tokamak-network/Tokamak-zk-EVM/issues)
- Discord: [Tokamak Network Discord](https://discord.gg/tokamak)

---

**Happy Verifying! 🚀**


