import { createServer } from 'node:http'
import { createVendorRouter } from '@leash/vendors'
import { createApp } from './app.js'
import { PORT, vendorSecret } from './config.js'
import { openDatabase } from './db.js'
import { createCipher, loadMasterKey, MASTER_KEY_PATH } from './keystore.js'
import { createRunner } from './runner.js'
import { ensureSponsorFunded, sponsorAccount } from './sponsor.js'
import { createStore } from './store.js'

const db = openDatabase()
const store = createStore(db, createCipher(loadMasterKey()))
const sealed = store.sealPlaintextKeys()
if (sealed > 0) console.log(`sealed ${sealed} agent keys with the master key at ${MASTER_KEY_PATH}`)
const sponsor = sponsorAccount()
try {
  const funded = await ensureSponsorFunded(sponsor.address)
  console.log(`vendor fee sponsor ${sponsor.address}: ${funded.topUp ? 'topped up from the faucet, ' : ''}${funded.balance} PathUSD units`)
} catch (e) {
  console.error(`[leash-api] vendor fee sponsor ${sponsor.address} could not be funded, sponsored payments will fail until it is: ${(e as Error).message.split('\n')[0]}`)
}
const handle = createApp({ store, runner: createRunner(store), vendors: createVendorRouter({ secretKey: vendorSecret(), feePayer: sponsor }), sponsor: sponsor.address })

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
