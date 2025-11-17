import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'TokamakSynthesizerBrowser',
      formats: ['es', 'umd'],
      fileName: format => `synthesizer-browser.${format}.js`,
    },
    rollupOptions: {
      external: ['ethers', '@tokamak-zk-evm/synthesizer'],
      output: {
        globals: {
          ethers: 'ethers',
          '@tokamak-zk-evm/synthesizer': 'TokamakSynthesizer',
        },
      },
    },
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
  },
  resolve: {
    alias: {
      'node:url': 'url',
      'node:path': 'path-browserify',
      'node:fs': 'memfs',
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['ethers'],
  },
});

