import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/browser/index.ts'),
      name: 'TokamakSynthesizer',
      formats: ['es', 'umd'],
      fileName: format => `synthesizer-browser.${format}.js`,
    },
    rollupOptions: {
      // Externalize dependencies that should be provided by the host
      external: ['ethers'],
      output: {
        globals: {
          ethers: 'ethers',
        },
      },
    },
    outDir: 'dist/browser',
    sourcemap: true,
    minify: 'esbuild',
  },
  resolve: {
    alias: {
      // Path alias for absolute imports
      'src': resolve(__dirname, './src'),
      // Browser-compatible polyfills
      'node:url': 'url',
      'node:path': 'path-browserify',
      'node:fs': 'memfs',
    },
  },
  define: {
    // Define Node.js globals for browser
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['ethers'],
  },
});

