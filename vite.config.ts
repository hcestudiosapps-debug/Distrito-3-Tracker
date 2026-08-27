import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'

export default defineConfig({
  base: './',
  plugins: [
    // Transform .geojson files to ES modules exporting parsed JSON
    {
      name: 'geojson',
      transform(_code, id) {
        if (id.endsWith('.geojson')) {
          const json = readFileSync(id, 'utf-8')
          return { code: `export default ${json}`, map: null }
        }
      }
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Distrito 3 Tracker',
        short_name: 'Distrito 3',
        description: 'Seguimiento GPS de recorridos de campo del Distrito 3',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'portrait',
        scope: './',
        start_url: './',
        categories: ['utilities', 'navigation'],
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ]
})
