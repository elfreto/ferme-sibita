import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo-coq.png', 'logo-complet.png'],
      manifest: {
        name: 'La Ferme de Sibita',
        short_name: 'Sibita',
        description: 'Suivi des bandes de poulets de chair',
        lang: 'fr',
        theme_color: '#2f6b3a',
        background_color: '#f6f3ea',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,json}'] }
    })
  ],
  test: { environment: 'node' }
} as any)
