import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind all interfaces and accept the live-preview proxy host.
    host: '0.0.0.0',
    allowedHosts: true,
  },
  css: {
    // Novelka uses plain CSS and needs no PostCSS plugins. Declaring an empty
    // config here stops Vite searching parent folders for a stray one.
    postcss: {
      plugins: [],
    },
  },
})
