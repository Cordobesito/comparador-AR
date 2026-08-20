import { execSync } from 'node:child_process'
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

/**
 * Sello de versión.
 *
 * Sin esto no hay forma de mirar la página publicada y saber de qué commit
 * salió: hay que bajar los archivos y comparar hashes contra el build local.
 * Con el sello, se lee de un vistazo si lo que está en el aire es lo último.
 *
 * COMMIT_REF lo define Netlify durante el build. En local no existe, así que
 * se pregunta a git; y si tampoco hay git (una copia descomprimida de un zip)
 * queda "local", que es información honesta y no rompe el build.
 */
function versionDelBuild() {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'local'
  }
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true, proxy },
  preview: { port: 4173, proxy },
  build: { target: 'es2020', sourcemap: false },
  define: {
    __COMMIT__: JSON.stringify(versionDelBuild()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
})
