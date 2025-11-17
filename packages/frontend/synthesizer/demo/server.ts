/**
 * Demo server for testing Synthesizer in browser UI
 * Backend runs on Node.js with tsx, frontend displays results
 */

import express from 'express';
import { config } from 'dotenv';
import { resolve } from 'path';
import { SynthesizerAdapter } from '@tokamak-zk-evm/synthesizer';

// Disable SSL certificate validation for development
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Load .env file from project root
config({ path: resolve(process.cwd(), '../../../../.env') });

const app = express();
const PORT = 3000;

app.use(express.json());

// API endpoint to synthesize a transaction
app.post('/api/synthesize', async (req, res) => {
  try {
    const { txHash, rpcUrl } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }

    const finalRpcUrl = rpcUrl || process.env.RPC_URL;
    if (!finalRpcUrl) {
      return res.status(400).json({ error: 'RPC URL is required' });
    }

    console.log(`\n🔍 Processing transaction: ${txHash}`);
    console.log(`📡 Using RPC: ${finalRpcUrl.substring(0, 50)}...`);

    const adapter = new SynthesizerAdapter({ rpcUrl: finalRpcUrl });
    const startTime = Date.now();

    const result = await adapter.synthesize(txHash);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Synthesis completed in ${duration}s`);

    res.json({
      success: true,
      duration: parseFloat(duration),
      result: {
        instance: {
          a_pub_length: result.instance.a_pub.length,
          a_pub_first: result.instance.a_pub[0],
          a_pub_last: result.instance.a_pub[result.instance.a_pub.length - 1],
          a_pub_sample: result.instance.a_pub.slice(0, 10), // First 10 values
        },
        placementVariablesCount: result.placementVariables.length,
        permutationCount: result.permutation.length,
        permutationSample: result.permutation.slice(0, 5),
        metadata: result.metadata,
      },
    });
  } catch (error) {
    console.error('❌ Synthesis error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    rpcConfigured: !!process.env.RPC_URL,
    timestamp: new Date().toISOString(),
  });
});

// Main page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tokamak Synthesizer - Demo</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 32px;
      text-align: center;
    }
    .header h1 {
      font-size: 32px;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .header p {
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 32px;
    }
    .input-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 8px;
      color: #333;
      font-size: 14px;
    }
    input[type="text"] {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e1e4e8;
      border-radius: 8px;
      font-size: 14px;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #667eea;
    }
    .button-group {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    button {
      flex: 1;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 14px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
    }
    button:active:not(:disabled) {
      transform: translateY(0);
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    #status {
      margin-top: 24px;
      padding: 16px;
      border-radius: 8px;
      display: none;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    #status.info {
      background: #e3f2fd;
      border-left: 4px solid #2196F3;
      color: #1565C0;
      display: block;
    }
    #status.success {
      background: #e8f5e9;
      border-left: 4px solid #4CAF50;
      color: #2E7D32;
      display: block;
    }
    #status.error {
      background: #ffebee;
      border-left: 4px solid #f44336;
      color: #c62828;
      display: block;
    }
    #results {
      margin-top: 32px;
      display: none;
      animation: fadeIn 0.5s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .result-card {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
      border: 1px solid #e1e4e8;
    }
    .result-card h3 {
      color: #333;
      margin-bottom: 16px;
      font-size: 18px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .result-card h3::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 2px;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e1e4e8;
    }
    .metric:last-child {
      border-bottom: none;
    }
    .metric-label {
      font-weight: 600;
      color: #666;
    }
    .metric-value {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      color: #333;
      font-weight: 500;
    }
    pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.6;
      margin-top: 12px;
    }
    .spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 3px solid rgba(255,255,255,.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 8px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background: #667eea;
      color: white;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 Tokamak Synthesizer Demo</h1>
      <p>Convert Ethereum transactions into zero-knowledge circuit inputs</p>
    </div>

    <div class="content">
      <div class="input-group">
        <label for="rpcUrl">RPC URL <span class="badge">Optional</span></label>
        <input
          type="text"
          id="rpcUrl"
          placeholder="Leave empty to use server's RPC configuration"
        >
      </div>

      <div class="input-group">
        <label for="txHash">Transaction Hash</label>
        <input
          type="text"
          id="txHash"
          placeholder="0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41"
          value="0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41"
        >
      </div>

      <div class="button-group">
        <button id="synthesizeBtn" onclick="synthesize()">
          <span id="btnText">🔮 Synthesize Transaction</span>
        </button>
      </div>

      <div id="status"></div>

      <div id="results">
        <div class="result-card">
          <h3>⚡ Performance</h3>
          <div class="metric">
            <span class="metric-label">Duration</span>
            <span class="metric-value"><span id="duration">-</span>s</span>
          </div>
        </div>

        <div class="result-card">
          <h3>📊 Public Inputs (a_pub)</h3>
          <div class="metric">
            <span class="metric-label">Total Length</span>
            <span class="metric-value" id="apubLength">-</span>
          </div>
          <div class="metric">
            <span class="metric-label">First Value</span>
            <span class="metric-value" id="apubFirst">-</span>
          </div>
          <div class="metric">
            <span class="metric-label">Last Value</span>
            <span class="metric-value" id="apubLast">-</span>
          </div>
          <pre id="apubSample">-</pre>
        </div>

        <div class="result-card">
          <h3>🔢 Circuit Variables</h3>
          <div class="metric">
            <span class="metric-label">Placement Variables</span>
            <span class="metric-value" id="placementCount">-</span>
          </div>
          <div class="metric">
            <span class="metric-label">Permutation Entries</span>
            <span class="metric-value" id="permutationCount">-</span>
          </div>
          <pre id="permutationSample">-</pre>
        </div>

        <div class="result-card">
          <h3>📝 Metadata</h3>
          <pre id="metadata">-</pre>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function synthesize() {
      const rpcUrl = document.getElementById('rpcUrl').value;
      const txHash = document.getElementById('txHash').value;
      const statusEl = document.getElementById('status');
      const resultsEl = document.getElementById('results');
      const btn = document.getElementById('synthesizeBtn');
      const btnText = document.getElementById('btnText');

      // Validation
      if (!txHash || !txHash.startsWith('0x')) {
        statusEl.className = 'error';
        statusEl.textContent = '❌ Please enter a valid transaction hash (starting with 0x)';
        return;
      }

      // Show loading
      btn.disabled = true;
      btnText.innerHTML = '<span class="spinner"></span>Processing...';
      statusEl.className = 'info';
      statusEl.textContent = '⏳ Synthesizing transaction... This may take 1-2 minutes.';
      resultsEl.style.display = 'none';

      try {
        const response = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash, rpcUrl: rpcUrl || undefined }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Synthesis failed');
        }

        // Show success
        statusEl.className = 'success';
        statusEl.textContent = \`✅ Synthesis completed in \${data.duration}s\`;

        // Display results
        document.getElementById('duration').textContent = data.duration.toFixed(1);
        document.getElementById('apubLength').textContent = data.result.instance.a_pub_length;
        document.getElementById('apubFirst').textContent = data.result.instance.a_pub_first;
        document.getElementById('apubLast').textContent = data.result.instance.a_pub_last;
        document.getElementById('apubSample').textContent =
          JSON.stringify(data.result.instance.a_pub_sample, null, 2);

        document.getElementById('placementCount').textContent = data.result.placementVariablesCount;
        document.getElementById('permutationCount').textContent = data.result.permutationCount;
        document.getElementById('permutationSample').textContent =
          JSON.stringify(data.result.permutationSample, null, 2);

        document.getElementById('metadata').textContent =
          JSON.stringify(data.result.metadata, null, 2);

        resultsEl.style.display = 'block';

        console.log('Full result:', data);

      } catch (error) {
        console.error('Synthesis error:', error);
        statusEl.className = 'error';
        statusEl.textContent = \`❌ Error: \${error.message}\`;
      } finally {
        btn.disabled = false;
        btnText.innerHTML = '🔮 Synthesize Transaction';
      }
    }
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 Tokamak Synthesizer Demo Server                       ║
╚═══════════════════════════════════════════════════════════╝

  ✅ Server running at: http://localhost:${PORT}
  📡 RPC configured: ${process.env.RPC_URL ? 'Yes' : 'No (will require manual input)'}

  📝 Open your browser and navigate to:
     → http://localhost:${PORT}

  🔧 API endpoints:
     → POST /api/synthesize - Synthesize a transaction
     → GET  /api/health     - Health check

  Press Ctrl+C to stop
`);
});

