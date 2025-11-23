import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'public/manifest.json', dest: '.' },
        { src: 'public/icon*.png', dest: '.' },
        { src: 'public/content_scripts', dest: '.' }
      ]
    })
  ],
  build: {
    outDir: '../extension_dist', // Output to root adhd_start/extension_dist
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        profile: resolve(__dirname, 'src/profile/index.html'),
        background: resolve(__dirname, 'src/background/service-worker.js')
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'service-worker.js';
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      }
    }
  }
});