import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'public/manifest.json', dest: '.' },
        { src: 'public/icon*.png', dest: '.' },
        // Keep focus_games as raw JS for now as it's simple
        { src: 'public/content_scripts/focus_games.js', dest: 'content_scripts' }
      ]
    })
  ],
  build: {
    outDir: '../extension_dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        profile: resolve(__dirname, 'src/profile/index.html'),
        background: resolve(__dirname, 'src/background/service-worker.js'),
        // NEW: React Overlay Entry Point
        overlay: resolve(__dirname, 'src/overlay/overlay-main.jsx')
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'service-worker.js';
          if (chunk.name === 'overlay') return 'content_scripts/micro_start_overlay.js'; // Overwrite the old one location
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      }
    }
  }
});