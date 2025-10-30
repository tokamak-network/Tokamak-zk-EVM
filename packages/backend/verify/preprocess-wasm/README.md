# Tokamak zkEVM Preprocess - WebAssembly

Generate preprocess data for SNARK verification directly in the browser!

## ⚠️ Important Note - Performance

**For Production**: Preprocess should be run **on the server** or with **native Rust** for optimal performance:

```bash
cargo run --release --bin preprocess  # ~10 seconds
```

**Browser/WASM**: This implementation proves it's **technically possible** to run in browsers, but:

- ⏱️ **~10 minutes** for typical circuits (vs. ~10 seconds native) - **60x slower**
- 💾 Requires ~1GB memory for typical circuits
- 🐌 **Why so slow?** WASM's BigInt emulation for BLS12-381 field arithmetic (256-bit) is 60-100x slower than native CPU instructions
- 🎯 **Best for**: Proof-of-concept, emergency fallback, or when server access is impossible

### Performance Breakdown (Typical Circuit)

```
Native Rust (Arkworks):  ~10 seconds
Browser WASM:            ~600 seconds (10 minutes)
  - JSON parsing (JS):    ~10 seconds
  - MSM operations (2x):  ~590 seconds (524K points × 2)
```

**Recommendation**: Use native `preprocess` on server, cache the result (tiny ~500 bytes), and use browser only for `verify-wasm`.

## 🎯 What is Preprocess?

Preprocess converts permutation constraints into cryptographic commitments (s0, s1) that are used during SNARK verification. This is a one-time operation per circuit configuration.

## 🚀 Quick Start

### 1. Build

```bash
cd packages/backend/verify/preprocess-wasm

# Build for web
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

#### Production Example (Server-side)

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Preprocess Demo</title>
  </head>
  <body>
    <button id="generate">Generate Preprocess</button>
    <div id="result"></div>

    <script type="module">
      import init, { PreprocessWasm } from './pkg-web/preprocess_wasm.js';

      document.getElementById('generate').onclick = async () => {
        // Initialize WASM
        await init();

        // Load data from server (recommended for production)
        const sigma = await fetch('/api/sigma_preprocess.json').then((r) =>
          r.text(),
        );
        const permutation = await fetch('/api/permutation.json').then((r) =>
          r.text(),
        );
        const setupParams = await fetch('/api/setupParams.json').then((r) =>
          r.text(),
        );

        // Generate preprocess
        const preprocess = new PreprocessWasm(sigma, permutation, setupParams);

        // Get result
        const result = preprocess.toJSON();
        document.getElementById('result').textContent = result;

        // Clean up
        preprocess.free();
      };
    </script>
  </body>
</html>
```

#### Browser Example (File Upload)

```html
<input type="file" id="sigmaFile" accept=".json" />
<script>
  const file = document.getElementById('sigmaFile').files[0];
  const sigmaJson = await file.text();
  // ... use sigmaJson
</script>
```

## 📦 API

### PreprocessWasm

```typescript
class PreprocessWasm {
  constructor(
    sigmaJson: string,
    permutationJson: string,
    setupParamsJson: string,
  );

  // Get preprocess as JSON
  toJSON(): string;

  // Get formatted preprocess for Solidity verifier
  toFormattedJSON(): string;

  // Clean up memory
  free(): void;
}
```

## 📊 Input Format

### Sigma Preprocess JSON

```json
{
  "sigma_1": {
    "xy_powers": [
      {
        "x": "0x...",
        "y": "0x..."
      }
      // ... more points
    ]
  }
}
```

### Permutation JSON

```json
[
  {
    "row": 0,
    "col": 0,
    "X": 0,
    "Y": 0
  }
  // ... more permutations
]
```

### Setup Params JSON

```json
{
  "l": 64,
  "l_pub_in": 32,
  "l_pub_out": 32,
  "l_prv_in": 0,
  "l_prv_out": 0,
  "l_D": 1088,
  "m_D": 1088,
  "n": 1024,
  "s_D": 1,
  "s_max": 512
}
```

## 🔧 How It Works

1. **Permutation to Polynomial**: Converts permutation constraints into 2D polynomials using IFFT
2. **Polynomial Encoding**: Encodes polynomials using Multi-Scalar Multiplication (MSM) with CRS
3. **Format Conversion**: Outputs in both standard and Solidity-compatible formats

## 🎨 Implementation Details

### Pure Arkworks

- No ICICLE dependency (browser-compatible)
- Uses Arkworks for all cryptographic operations
- 2D IFFT implemented with Radix2EvaluationDomain
- MSM using VariableBaseMSM

## 📚 References

- [Arkworks Library](https://github.com/arkworks-rs)
- [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
- [Native Preprocess Implementation](../preprocess/src/lib.rs)
