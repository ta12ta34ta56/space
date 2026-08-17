import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * Public builds ship without the control panel.
 *
 *   VITE_ENABLE_ADMIN=false npm run build
 *
 * `ADMIN_BUILT_IN` then folds to false, the lazy imports become unreachable,
 * and this plugin deletes the emitted chunks so the panel is not merely hidden
 * — it is not in the deployed files at all.
 */
const adminEnabled = process.env.VITE_ENABLE_ADMIN !== 'false'

const dropAdminChunks = {
  name: 'novelka-drop-admin-chunks',
  generateBundle(_options: unknown, bundle: Record<string, unknown>) {
    if (adminEnabled) return
    for (const name of Object.keys(bundle)) {
      if (/AdminPanel|OwnerGate|admin|AdminApp/i.test(name)) delete bundle[name]
    }
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropAdminChunks],
  server: {
    // Bind all interfaces and accept the live-preview proxy host (Arena
    // serves the preview from a *.e2b.app origin).
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  define: {
    // Inlined as a literal so `if (!ADMIN_BUILT_IN)` folds at build time and
    // the unlock watcher is eliminated entirely from a public build.
    'import.meta.env.VITE_ENABLE_ADMIN': JSON.stringify(adminEnabled ? 'true' : 'false'),
  },
  css: {
    // Inline (empty) PostCSS config.
    // Novelka uses plain CSS and needs no PostCSS plugins.
    // Declaring it here stops Vite from searching parent folders for a
    // postcss config — a stray/empty one further up the disk (e.g. in
    // Desktop or the user home folder) would otherwise crash the dev server
    // with "Failed to load PostCSS config: Unexpected end of JSON input".
    postcss: {
      plugins: [],
    },
  },
  build: {
    // Every chunk the browser needs on first load is far below 500 kB (main
    // ~340 kB, react/fabric vendors ~190/310 kB). The only larger chunks are
    // vendored, lazily-loaded assets: @pdf-lib/fontkit (711 kB, fetched only
    // when a PDF export embeds fonts) and the pdfjs worker (loaded only when
    // a PDF is imported). They cannot be split further, so raise the limit
    // just enough to cover them — any NEW hot-path chunk over 750 kB still
    // warns.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      input: adminEnabled
        ? {
            main: resolve(__dirname, 'index.html'),
            admin: resolve(__dirname, 'admin.html'),
          }
        : {
            main: resolve(__dirname, 'index.html'),
          },
      onwarn(warning, warn) {
        if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return;
        warn(warning);
      },
    },
  },
});
