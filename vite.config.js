import { defineConfig } from 'vite';
import fs from 'fs';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'app.js',
      output: {
        format: 'iife',
        entryFileNames: 'bundle.js',
        inlineDynamicImports: true
      }
    }
  },
  plugins: [
    {
      name: 'copy-index-to-dist',
      closeBundle() {
        if (fs.existsSync('index.html')) {
          fs.copyFileSync('index.html', 'dist/index.html');
        }
      }
    }
  ]
});
