import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Espejo local de los proxies de netlify.toml.
 *
 * api.argentinadatos.com no manda cabeceras CORS, así que tanto en
 * dev como en prod la app pega contra rutas relativas (/api/ad/...)
 * y el servidor las reenvía. Si estos dos archivos se desincronizan,
 * la app funciona en local y se rompe en producción (o al revés).
 */
const proxy = {
  '/api/ad': {
    target: 'https://api.argentinadatos.com',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/api\/ad/, ''),
  },
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true, proxy },
  preview: { port: 4173, proxy },
  build: { target: 'es2020', sourcemap: false },
})
