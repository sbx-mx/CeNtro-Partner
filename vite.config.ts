import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/CeNtro-Partner/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // Evita fallos de Terser en la generación del SW entre Node 22/24.
      // La aplicación principal continúa minificada por Vite.
      mode: 'development',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: BASE,
        name: 'CeNtro Partner',
        short_name: 'CeNtro Partner',
        description: 'Ranking regional Ops + RH · Región Centro Norte',
        lang: 'es-MX',
        start_url: BASE,
        scope: BASE,
        theme_color: '#006241',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        // El Excel se actualiza de forma independiente mediante NetworkFirst;
        // no debe quedar fijado a una revisión del precaché.
        globPatterns: ['**/*.{js,css,html,json,png,svg}'],
        globIgnores: ['assets/CeNtro Partner.png'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.xlsx'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'centro-partner-excel-v2-1',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 2, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/data/campaign.json'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName:'centro-partner-campaign-v1' },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
  },
})
