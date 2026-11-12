import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // SheetJS makes the bundle ~800 kB; it loads once and is then served offline from the cache.
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    react(),
    // Installable app that works offline; updates wait for the guard to click Reload (see UpdateBanner).
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Meal access',
        short_name: 'Meal access',
        description: 'Check restaurant guests by RFID tag against the daily Rex meal report.',
        display: 'standalone',
        start_url: '/',
        background_color: '#f6f6f3',
        theme_color: '#1f6f4a',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      // woff2: the bundled Inter font, so it also shows offline.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
    }),
  ],
})
