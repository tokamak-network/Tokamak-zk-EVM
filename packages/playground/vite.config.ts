import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(), 
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    {
      name: 'configure-response-headers',
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          next();
        });
      },
    },
    {
      name: 'resolve-fs',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'fs') {
          return path.resolve(__dirname, 'src/shims/fs.js');
        }
      }
    }
  ],
  resolve: {
    mainFields: ['browser', 'module', 'main'],
    alias: {
      path: 'path-browserify',
      'app-root-path': path.resolve(__dirname, 'src/shims/app-root-path.js'),
    }
  },
  define: {
    'process.env': {},
    '__dirname': JSON.stringify('/'),
    '__filename': JSON.stringify('/index.html'),
    'global': 'window',
  },
  optimizeDeps: {
    force: true,
    include: ['path-browserify'],
    exclude: ['fs', 'app-root-path'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
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
})