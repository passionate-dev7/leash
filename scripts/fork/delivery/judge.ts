// argv: outcomes.json agentKey token recipientsCsv. Prints {decisions, cuts:[{recipient, plan}]} using the real
// @leash/policy decideCuts and @leash/sdk planDeliveryCuts (the same code the SDK ships), as JSON.
import { readFileSync } from 'node:fs'
import { decideCuts } from '../../../packages/policy/src/delivery-cut.ts'
import { planDeliveryCuts } from '../../../packages/sdk/src/delivery-cut.ts'
const [file, key, token, recips] = process.argv.slice(2) as [string, `0x${string}`, `0x${string}`, string]
const outcomes = JSON.parse(readFileSync(file, 'utf8'))
const keys = [{ keyId: key, scopes: [{ target: token, selectorRules: [{ selector: '0xa9059cbb' as const, recipients: recips.split(',') as `0x${string}`[] }] }] }]
const cuts = planDeliveryCuts(outcomes, keys).map((c) => ({ recipient: c.decision.recipient, plan: c.plan }))
console.log(JSON.stringify({ decisions: decideCuts(outcomes), cuts }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
