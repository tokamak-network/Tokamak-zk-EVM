import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,  
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  resolve: {
    alias: {
      '@ethereumjs/common/dist/esm/index.js': path.resolve(__dirname, '../frontend/synthesizer/libs/common/dist/esm/index.js'),
      '@ethereumjs/common': path.resolve(__dirname, '../frontend/synthesizer/libs/common/dist/esm/index.js'),
      '@ethereumjs/statemanager/index.js': path.resolve(__dirname, '../frontend/synthesizer/libs/statemanager/dist/esm/index.js'),
      '@ethereumjs/statemanager': path.resolve(__dirname, '../frontend/synthesizer/libs/statemanager/dist/esm/index.js'),
      '@ethereumjs/util/index.js': path.resolve(__dirname, '../frontend/synthesizer/libs/util/dist/esm/index.js'),
      '@ethereumjs/util': path.resolve(__dirname, '../frontend/synthesizer/libs/util/dist/esm/index.js'),
      '@ethereumjs/mpt/index.js': path.resolve(__dirname, '../frontend/synthesizer/libs/mpt/dist/esm/index.js'),
      '@ethereumjs/mpt': path.resolve(__dirname, '../frontend/synthesizer/libs/mpt/dist/esm/index.js'),
      '@ethereumjs/verkle/index.js': path.resolve(__dirname, '../frontend/synthesizer/libs/verkle/dist/esm/index.js'),
      '@ethereumjs/verkle': path.resolve(__dirname, '../frontend/synthesizer/libs/verkle/dist/esm/index.js'),
      
    }
  }
})

