import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Excalidraw resolves *fonts* from `window.EXCALIDRAW_ASSET_PATH` and, if that
 * fails, falls back to a public CDN. A CDN fallback is not acceptable in an MV3
 * extension (CSP violation, breaks offline mode, leaks a request to a third party),
 * so we ship them inside the extension and point the runtime at them.
 *
 * They are copied into Vite's own `dist/assets/fonts/` (rather than a second,
 * engine-specific folder at the package root) so the extension ships exactly one asset
 * root: `dist/assets/` holds the hashed chunks *and* the fonts, and `EXCALIDRAW_ASSET_PATH`
 * simply points at it. The copy runs in `closeBundle`, after Vite has written its output,
 * and the font filenames are unhashed, so nothing can collide with a Vite-emitted asset.
 */
/**
 * Font families we deliberately do not ship.
 *
 * `Xiaolai` is a CJK handwriting face that Excalidraw ships as ~200 unicode-range subset
 * files: 13 MB, or two thirds of the whole package, for a feature this release does not
 * localise for. Leaving it out means CJK text falls back to the system font stack. Remove
 * it from this list to ship it again (costs 13 MB in the ZIP).
 */
const SKIPPED_FONT_FAMILIES = new Set(['Xiaolai']);

function copyExcalidrawAssets(): Plugin {
  const from = resolve(root, 'node_modules/@excalidraw/excalidraw/dist/prod');
  return {
    name: 'sketchpilot:copy-excalidraw-assets',
    apply: 'build',
    closeBundle() {
      const to = resolve(root, 'dist/assets');
      if (!existsSync(from)) throw new Error(`Excalidraw assets missing at ${from}`);
      mkdirSync(to, { recursive: true });
      // Copy family by family so a skipped family really is absent: `cpSync` merges into an
      // existing directory, so a stale build would otherwise keep it.
      rmSync(resolve(to, 'fonts'), { recursive: true, force: true });
      for (const family of readdirSync(resolve(from, 'fonts'), { withFileTypes: true })) {
        if (!family.isDirectory() || SKIPPED_FONT_FAMILIES.has(family.name)) continue;
        cpSync(resolve(from, 'fonts', family.name), resolve(to, 'fonts', family.name), { recursive: true });
      }
      // Locales are deliberately NOT copied. The engine's `locales/*.json` are static imports, so
      // Rollup emits them as lazy chunks in `assets/` (one per language, loaded on demand); nothing
      // in the build ever fetches the package's own locale folder. Copying it shipped 1.7 MB
      // of files no code path reads. It is removed here so a stale build cannot keep it around.
      rmSync(resolve(to, 'locales'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExcalidrawAssets()],
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
      // Not used by the product; see src/stubs/mermaid-to-excalidraw.ts.
      '@excalidraw/mermaid-to-excalidraw': resolve(root, 'src/stubs/mermaid-to-excalidraw.ts'),
    },
  },
  define: {
    // Excalidraw reads these at module scope; Vite would otherwise leave `process` undefined.
    'process.env.IS_PREACT': JSON.stringify('false'),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(root, 'popup.html'),
        editor: resolve(root, 'editor.html'),
        dashboard: resolve(root, 'dashboard.html'),
        settings: resolve(root, 'settings.html'),
        background: resolve(root, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
