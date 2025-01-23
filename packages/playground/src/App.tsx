import React, { useState } from 'react';
import { fetchTransactionBytecode } from '../utils/etherscanApi';
import { Buffer } from 'buffer';
import { createEVM } from '../../evm/src/constructors';
//import { finalize } from '../../evm/src/tokamak/core/finalize';

window.Buffer = window.Buffer || Buffer;

const App: React.FC = () => {
  const [transactionId, setTransactionId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  // app.tsx
const handleSubmit = async () => {
  try {
    const bytecode = await fetchTransactionBytecode(transactionId);
    const evm = await createEVM();
    const res = await evm.runCode({
      code: Uint8Array.from(Buffer.from(bytecode.slice(2), 'hex')),
      gasLimit: BigInt(0xffff),
    });

    // Instead of calling finalize() here, POST to our server
    setStatus('Finalizing placements (server request)...');
    const response = await fetch('http://localhost:3001/api/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placements: res.runState!.synthesizer.placements, // or whatever structure
      }),
    });

    const json = await response.json();
    if (!json.ok) throw new Error(json.error);

    setStatus('Process complete!');
    setOutput(JSON.stringify(json.data, null, 2));
  } catch (error) {
    console.error('Error:', error);
    setStatus('Error processing the transaction.');
    setOutput('Error processing transaction');
  }
};


  return (
    <div style={{ padding: '20px' }}>
      <h1>Synthesizer Developer Playground</h1>
      <input
        type="text"
        value={transactionId}
        onChange={(e) => setTransactionId(e.target.value)}
        placeholder="Enter Transaction ID"
        style={{
          padding: '10px',
          width: '300px',
          marginRight: '10px',
          border: '1px solid #ccc',
          borderRadius: '4px',
        }}
      />
      <button
        onClick={handleSubmit}
        style={{
          padding: '10px 20px',
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Process
      </button>
      <div style={{ marginTop: '20px' }}>
        {status && <p>{status}</p>}
        {output && <pre>{output}</pre>}
      </div>
    </div>
  );
};

export default App;
