import { defineConfig } from 'vite';
import fs from 'fs';

// Stores the original dev-format index.html before Vite transforms it
let originalDevHtml = '';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'bundle.js',
        assetFileNames: '[name][extname]',
        inlineDynamicImports: true
      }
    },
    cssCodeSplit: false
  },
  plugins: [
    {
      name: 'spark-painters-build',

      buildStart() {
        // Read current index.html
        let html = fs.readFileSync('index.html', 'utf8');

        // If the root index.html was left in production mode from a previous build,
        // restore it to dev format so Vite can process it as its entry point.
        if (html.includes('<script src="dist/bundle.js">')) {
          html = html.replace(
            '<script src="dist/bundle.js"></script>',
            '<script type="module" src="app.js"></script>'
          );
          fs.writeFileSync('index.html', html, 'utf8');
        }

        // Save the dev-format HTML for use in closeBundle
        originalDevHtml = html;
      },

      transformIndexHtml(html) {
        // Strip type="module" and crossorigin from <script> tags only.
        // This applies to dist/index.html so it loads without CORS errors
        // on file:// protocol and inside Capacitor WebView.
        return html
          .replace(
            /<script\s+type="module"\s+crossorigin\s+src="([^"]+)"><\/script>/g,
            '<script src="$1"></script>'
          )
          .replace(
            /<script\s+type="module"\s+src="([^"]+)"><\/script>/g,
            '<script src="$1"></script>'
          )
          .replace(
            /<script\s+crossorigin\s+src="([^"]+)"><\/script>/g,
            '<script src="$1"></script>'
          );
      },

      closeBundle() {
        // 1. Copy styles.css into dist/ so Capacitor WebView can load it
        if (fs.existsSync('styles.css')) {
          fs.copyFileSync('styles.css', 'dist/styles.css');
        }

        // 2. Copy assets/ folder into dist/ so local images (logo etc.) are bundled
        if (fs.existsSync('assets')) {
          const copyDir = (src, dest) => {
            fs.mkdirSync(dest, { recursive: true });
            for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
              const srcPath = src + '/' + entry.name;
              const destPath = dest + '/' + entry.name;
              if (entry.isDirectory()) copyDir(srcPath, destPath);
              else fs.copyFileSync(srcPath, destPath);
            }
          };
          copyDir('assets', 'dist/assets');
        }

        // 3. Overwrite root index.html with a production version that loads
        //    dist/bundle.js — this is what the user double-clicks in File Explorer.
        //    Standard <script src> (no type="module") works on file:// without CORS errors.
        const productionHtml = originalDevHtml.replace(
          '<script type="module" src="app.js"></script>',
          '<script src="dist/bundle.js"></script>'
        );
        fs.writeFileSync('index.html', productionHtml, 'utf8');
      }
    }
  ]
});
