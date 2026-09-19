import { parseUnits } from 'viem'
import { Account } from 'viem/tempo'
import { readFileSync } from 'node:fs'
import { createLeashClient } from '../src/client.js'
import { agentKeyFromSecp256k1 } from '../src/keys.js'
import { chargeCalldata } from '../src/payments.js'

const keys = JSON.parse(readFileSync('/Users/kamal/Desktop/solana/leash/testnet/keys.json','utf8'))
const addrs = JSON.parse(readFileSync('/Users/kamal/Desktop/solana/leash/testnet/addrs.json','utf8'))
const LABEL = 'ADVERSARIAL_1789750116784'
const owner = Account.fromSecp256k1(keys.OWNER)
const agentKey = agentKeyFromSecp256k1(keys[LABEL])
const acct = agentKey.toAccount(owner)
const client = createLeashClient({ network: 'moderato', sponsor: true })
const PATH_USD = '0x20c0000000000000000000000000000000000000'
try {
  const hash = await client.sendTransaction({
    account: acct,
    calls: [{ to: PATH_USD, data: chargeCalldata({ to: addrs.MERCHANT_A, amount: parseUnits('1',6), reference:'probe' }) }],
    feePayer: true,
  } as never)
  console.log('UNEXPECTED SEND OK', hash)
  const r = await client.waitForTransactionReceipt({ hash, timeout: 20000 })
  console.log('receipt status', r.status)
} catch (e: any) {
  console.log('=== RAW ERROR ===')
  console.log('name:', e?.name)
  console.log('shortMessage:', e?.shortMessage)
  console.log('message:', String(e?.message).slice(0, 1200))
  console.log('details:', e?.details)
  console.log('cause.name:', e?.cause?.name, '| cause.message:', String(e?.cause?.message||'').slice(0,400))
}
