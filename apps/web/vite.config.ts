import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Dev talks to the local API. A build without VITE_LEASH_API calls the API on the page's own origin.
  const api = env.VITE_LEASH_API ?? (command === 'serve' ? 'http://localhost:4180' : '')
  return {
    base: './',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: [react(), tailwindcss()],
    define: { __LEASH_API__: JSON.stringify(api.replace(/\/+$/, '')) },
    server: { port: 5173, strictPort: true },
    build: { target: 'es2023', chunkSizeWarningLimit: 900 },
  }
})
