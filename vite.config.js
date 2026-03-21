import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import tailwindcss from '@tailwindcss/vite';

const port = parseInt(process.env.PORT ?? '3000', 10);

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), tailwindcss()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port,
    open: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port,
    },
  },
  assetsInclude: ['**/*.wasm'],
});
