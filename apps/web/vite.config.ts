import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const api = env.VITE_LEASH_API ?? (command === 'serve' ? 'http://localhost:4180' : undefined)
  if (api === undefined) throw new Error('VITE_LEASH_API is required for a production build (the base URL of the Leash API).')
  return {
    base: './',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: [react(), tailwindcss()],
    define: { __LEASH_API__: JSON.stringify(api.replace(/\/+$/, '')) },
    server: { port: 5173, strictPort: true },
    build: { target: 'es2023', chunkSizeWarningLimit: 900 },
  }
})
