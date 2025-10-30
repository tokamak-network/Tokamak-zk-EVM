// Web Worker for Preprocess WASM (ES6 Module)
// This runs in a separate thread to avoid blocking the UI

import init, { PreprocessWasm } from './pkg-web/preprocess_wasm.js';

let wasmInitialized = false;

// Listen for messages from main thread
self.onmessage = async function(e) {
  const { type, data } = e.data;
  
  try {
    if (type === 'INIT') {
      // Initialize WASM
      await init();
      wasmInitialized = true;
      self.postMessage({ type: 'INIT_COMPLETE' });
      
    } else if (type === 'PROCESS') {
      if (!wasmInitialized) {
        throw new Error('WASM not initialized');
      }
      
      const { sigmaJson, permutationJson, setupParamsJson } = data;
      
      // Parse JSON in JavaScript (much faster than Rust serde_json!)
      self.postMessage({ type: 'PROGRESS', message: 'Parsing sigma JSON in JavaScript (492MB)...' });
      const sigmaObj = JSON.parse(sigmaJson);
      self.postMessage({ type: 'PROGRESS', message: '✅ Sigma parsed!' });
      
      self.postMessage({ type: 'PROGRESS', message: 'Parsing permutation JSON...' });
      const permutationObj = JSON.parse(permutationJson);
      self.postMessage({ type: 'PROGRESS', message: '✅ Permutation parsed!' });
      
      self.postMessage({ type: 'PROGRESS', message: 'Parsing setup params JSON...' });
      const setupParamsObj = JSON.parse(setupParamsJson);
      self.postMessage({ type: 'PROGRESS', message: '✅ Setup params parsed!' });
      
      // Send to WASM (now just converting JavaScript objects, not parsing!)
      self.postMessage({ type: 'PROGRESS', message: 'Converting data to WASM format...' });
      
      // Create PreprocessWasm instance with JavaScript objects
      const preprocess = new PreprocessWasm(
        sigmaObj,
        permutationObj,
        setupParamsObj
      );
      
      self.postMessage({ type: 'PROGRESS', message: 'Serializing results...' });
      
      // Get results
      const resultJson = preprocess.toJSON();
      const formattedJson = preprocess.toFormattedJSON();
      
      // Clean up
      preprocess.free();
      
      // Send results back to main thread
      self.postMessage({
        type: 'COMPLETE',
        result: {
          preprocessJson: resultJson,
          formattedJson: formattedJson
        }
      });
      
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
    
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error.message || error.toString()
    });
  }
};

// Handle errors
self.onerror = function(error) {
  self.postMessage({
    type: 'ERROR',
    error: error.message || error.toString()
  });
};

