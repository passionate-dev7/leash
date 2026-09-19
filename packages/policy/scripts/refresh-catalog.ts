/**
 * Rebuilds the recipient index by probing every tempo-payable MPP service for a live 402
 * challenge. Writes `data/recipients.<chainId>.json` with its own provenance.
 *
 *   pnpm --filter @leash/policy catalog:refresh            # chain 4217
 *   pnpm --filter @leash/policy catalog:refresh -- 42431   # chain 42431
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildRecipientIndex } from '../src/catalog.js'
import { sharedRecipients } from '../src/blast-radius.js'
import { CHAIN_ID } from '../src/types.js'

const chainId = Number(process.argv[2] ?? CHAIN_ID.mainnet)
const dataDir = fileURLToPath(new URL('../data/', import.meta.url))

process.stderr.write(`probing live 402 challenges for chain ${chainId}\n`)
const index = await buildRecipientIndex(chainId, {
  concurrency: 12,
  onProgress: (done, total) => process.stderr.write(`\r  ${done}/${total}`),
})
process.stderr.write('\n')

await mkdir(dataDir, { recursive: true })
const out = `${dataDir}recipients.${chainId}.json`
await writeFile(out, `${JSON.stringify(index, null, 2)}\n`, 'utf8')

const shared = sharedRecipients(index)
console.log(`catalog services        : ${index.catalogServiceCount}`)
console.log(`resolved recipients     : ${index.resolved.length}`)
console.log(`unresolved              : ${index.unresolved.length}`)
console.log(`distinct payout addrs   : ${new Set(index.resolved.map((r) => r.recipient.toLowerCase())).size}`)
console.log(`session-intent services : ${index.resolved.filter((r) => r.intent === 'session').length}`)
console.log(`written                 : ${out}`)
console.log('\nshared payout addresses, biggest first:')
for (const s of shared)
  console.log(
    `  ${s.recipient}  ${String(s.services.length).padStart(2)} services  realms=${s.realms.join(',')}\n      ${s.services.map((x) => x.serviceId).join(', ')}`,
  )
