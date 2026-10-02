import { createServer } from 'node:http'
import { createVendorRouter } from '@leash/vendors'
import { createApp } from './app.js'
import { PORT, vendorSecret } from './config.js'
import { openDatabase } from './db.js'
import { createRunner } from './runner.js'
import { createStore } from './store.js'

const db = openDatabase()
const store = createStore(db)
const handle = createApp({ store, runner: createRunner(store), vendors: createVendorRouter({ secretKey: vendorSecret() }) })

const host = process.env['LEASH_API_HOST'] ?? '127.0.0.1'
const server = createServer((req, res) => void handle(req, res))
server.requestTimeout = 0
server.listen(PORT, host, () => console.log(`leash api listening on http://${host}:${PORT}`))

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    server.close(() => {
      db.close()
      process.exit(0)
    })
  })
