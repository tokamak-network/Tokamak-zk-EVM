# Tokamak zkEVM Verifier - WebAssembly

✅ **Browser-Ready!** Works seamlessly in all major browsers (Chrome, Firefox, Safari, Edge).

## 🎯 Key Features

- ✅ **Full Browser Support**: Chrome 57+, Firefox 52+, Safari 11+, Edge 16+
- ✅ **Mobile Support**: iOS Safari, Chrome Android
- ✅ **No Server Required**: All verification runs client-side
- ✅ **Privacy Preserving**: No data transmitted externally
- ⚡ **Fast**: Verification completes in 3-5 seconds

## 🚀 Quick Start

### Option A: Install from NPM (Recommended)

```bash
# For Web/Browser
npm install @tokamak-zk-evm/verify-wasm-web

# For Node.js
npm install @tokamak-zk-evm/verify-wasm-nodejs

# For Bundlers (Webpack, Vite, etc.)
npm install @tokamak-zk-evm/verify-wasm-bundler
```

### Option B: Build from Source

```bash
cd packages/backend/verify/verify-wasm

# Install wasm-pack (first time only)
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Build
chmod +x build.sh
./build.sh
```

### 2. Test in Browser

```bash
# Start local server
python3 -m http.server 8000

# Open in browser
open http://localhost:8000/example-simple.html
```

### 3. Use in Your Code

#### Using NPM Package (Web)

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Verifier Demo</title>
  </head>
  <body>
    <button id="verify">Verify Proof</button>
    <div id="result"></div>

    <script type="module">
      // Import from NPM package
      import init, { Verifier } from '@tokamak-zk-evm/verify-wasm-web';

      // Or if using local build:
      // import init, { Verifier } from './pkg-web/verify_wasm.js';

      document.getElementById('verify').onclick = async () => {
        // Initialize WASM (~50ms)
        await init();

        // Load data
        const setupParams = await fetch('setupParams.json').then((r) =>
          r.json(),
        );
        const instance = await fetch('instance.json').then((r) => r.json());

        // Create verifier
        const verifier = new Verifier(
          JSON.stringify(setupParams),
          JSON.stringify(instance),
        );

        // Run verification (3-5 seconds)
        const result = verifier.verify_keccak256();

        // Display result
        document.getElementById('result').textContent =
          result === 0
            ? '✅ Passed'
            : result === 1
              ? '❌ Failed'
              : '⚠️ No Keccak data';

        // Clean up memory
        verifier.free();
      };
    </script>
  </body>
</html>
```

## 📦 Browser Compatibility

### ✅ Supported Browsers

| Browser              | Desktop | Mobile | Released |
| -------------------- | ------- | ------ | -------- |
| **Chrome**           | 57+     | 57+    | 2017     |
| **Firefox**          | 52+     | 52+    | 2017     |
| **Safari**           | 11+     | 11+    | 2017     |
| **Edge**             | 16+     | -      | 2017     |
| **Opera**            | 44+     | 44+    | 2017     |
| **Samsung Internet** | -       | 7.2+   | 2018     |

**Conclusion:** All browsers from 2017+ are supported! Compatible with 99%+ of current users.

## 🎨 Framework Integration

### React

```typescript
import { useEffect, useState } from 'react';
import init, { Verifier } from '@tokamak-zk-evm/verify-wasm-bundler';

function VerifyButton() {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    init(); // Component mount 시 WASM 초기화
  }, []);

  const handleVerify = async () => {
    setLoading(true);
    try {
      const verifier = new Verifier(setupParamsJson, instanceJson);
      const res = verifier.verify_keccak256();
      setResult(res === 0 ? 'Passed ✅' : 'Failed ❌');
      verifier.free();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleVerify} disabled={loading}>
      {loading ? 'Verifying...' : 'Verify Proof'}
    </button>
  );
}
```

### Vue.js

```vue
<template>
  <button @click="verify" :disabled="loading">
    {{ loading ? 'Verifying...' : 'Verify Proof' }}
  </button>
  <p v-if="result">{{ result }}</p>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import init, { Verifier } from '@tokamak-zk-evm/verify-wasm-bundler';

const loading = ref(false);
const result = ref('');

onMounted(() => init());

const verify = async () => {
  loading.value = true;
  try {
    const verifier = new Verifier(setupParamsJson, instanceJson);
    const res = verifier.verify_keccak256();
    result.value = res === 0 ? 'Passed ✅' : 'Failed ❌';
    verifier.free();
  } finally {
    loading.value = false;
  }
};
</script>
```

### Vanilla JavaScript

```javascript
// 가장 간단한 방법
import init, { Verifier } from './pkg-web/verify_wasm.js';

async function verify() {
  await init();

  const verifier = new Verifier(
    JSON.stringify(setupParams),
    JSON.stringify(instance),
  );

  const result = verifier.verify_keccak256();
  console.log('Result:', result);

  verifier.free();
}

verify();
```

## 🛠️ Build Options

### For Web Browsers

```bash
wasm-pack build --target web --out-dir pkg-web
```

Usage:

```javascript
import init from './pkg-web/verify_wasm.js';
```

### For Bundlers (Webpack, Vite, Rollup)

```bash
wasm-pack build --target bundler --out-dir pkg
```

Usage with NPM:

```javascript
import init from '@tokamak-zk-evm/verify-wasm-bundler';
```

Or with local build:

```javascript
import init from './pkg/verify_wasm.js';
```

### For Node.js

```bash
wasm-pack build --target nodejs --out-dir pkg-node
```

Usage with NPM:

```javascript
import { Verifier } from '@tokamak-zk-evm/verify-wasm-nodejs';
// or
const { Verifier } = require('@tokamak-zk-evm/verify-wasm-nodejs');
```

Or with local build:

```javascript
import { Verifier } from './pkg-node/verify_wasm.js';
```

## 🐛 Troubleshooting

### "CORS policy blocked" Error

**Cause:** WASM file loaded from different domain

**Solution:**

```javascript
// Method 1: Host WASM on same domain

// Method 2: Add CORS headers on server
Access-Control-Allow-Origin: *

// Method 3: For local testing
python3 -m http.server 8000
```

### "Memory access out of bounds" Error

**Cause:** Insufficient memory

**Solution:**

```javascript
// Process large data in Web Worker
const worker = new Worker('verifier-worker.js');
worker.postMessage({ setupParams, instance });
worker.onmessage = (e) => {
  console.log('Result:', e.data);
};
```

### Slow Performance

**Solution:**

```bash
# 1. Ensure release mode build
wasm-pack build --release

# 2. Size optimization
[profile.release]
opt-level = "z"  # Size optimization
lto = true       # Link Time Optimization
```

## 📱 Using in Mobile Browsers

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<script type="module">
  import init, { Verifier } from './pkg-web/verify_wasm.js';

  // Works on mobile too!
  await init();
  const verifier = new Verifier(setupParamsJson, instanceJson);
  const result = verifier.verify_keccak256();

  alert(result === 0 ? '✅ Verified!' : '❌ Failed');
  verifier.free();
</script>
```

**Tested on:**

- ✅ iPhone 12 Pro (iOS 15, Safari)
- ✅ Samsung Galaxy S21 (Android 12, Chrome)
- ✅ iPad Pro (iOS 16, Safari)

## 🔐 Security Considerations

### Content Security Policy (CSP)

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; 
               script-src 'self' 'wasm-unsafe-eval';"
/>
```

### Memory Management

```javascript
// ✅ Always call free()
try {
  const verifier = new Verifier(setupParamsJson, instanceJson);
  const result = verifier.verify_keccak256();
  return result;
} finally {
  verifier.free(); // Release memory
}
```

### Input Validation

```javascript
// Validate user input
function validateSetupParams(params) {
  if (!params.n || !Number.isInteger(params.n)) {
    throw new Error('Invalid n parameter');
  }
  if (!isPowerOfTwo(params.n)) {
    throw new Error('n must be power of two');
  }
  // ... additional validation
}
```

## 📊 Example Files

1. **example-simple.html**: Simplest example (copy and use directly)
2. **example-browser.html**: Demo with complete UI
3. **example-node.js**: Node.js usage example

## 🎯 Next Steps

1. **Build**: Run `./build.sh`
2. **Test**: Open `example-simple.html`
3. **Integrate**: Add to your app
4. **Deploy**: Enable compression and deploy

## 📚 References

- [WebAssembly Official Docs](https://webassembly.org/)
- [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
- [Arkworks Library](https://github.com/arkworks-rs)
