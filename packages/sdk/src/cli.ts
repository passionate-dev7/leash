import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { getAddress, isAddress } from 'viem'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { agentAccount, agentNetwork, fetchBlocked, fetchTeamNetwork, postRecord } from './agent.js'
import { createLeashFetch } from './mpp.js'

const DEFAULT_KEY_FILE = '.leash-agent.json'
const DEFAULT_DESK = 'https://leash-spend.vercel.app'
const DEFAULT_API = 'https://leash-api.fly.dev'
const MAX_BODY_PRINT = 8_000

const USAGE = `leash-agent: run an agent with your own key and report what it pays to a Leash desk.

  leash-agent init [--out .leash-agent.json] [--desk <desk url>] [--json]
      Generates a secp256k1 agent key in a file (mode 600, never printed) and prints its key id.
      Authorize that key id in the desk: Agents, "I run it".

  leash-agent pay <url> --team <account> [--api <desk api base>] [--network moderato|mainnet]
                        [--method POST] [--data '{...}'] [--key .leash-agent.json] [--json]
      Pays one MPP request with the agent key (Moderato in OUSD by default, mainnet in USDC.e),
      prints the response and the delivery record, and reports the signed record to the desk.
      The desk's record of the team names its network; a different --network is refused before
      anything is signed.

Environment: LEASH_API_URL stands in for --api (default ${DEFAULT_API}), LEASH_DESK_URL for --desk.`

class UsageError extends Error {}

function init(argv: string[]) {
  const { values } = parseArgs({ args: argv, options: { out: { type: 'string', default: DEFAULT_KEY_FILE }, desk: { type: 'string' }, json: { type: 'boolean' } } })
  const path = values.out!
  if (existsSync(path)) throw new UsageError(`${path} already exists. Refusing to overwrite an agent key.`)
  const privateKey = generatePrivateKey()
  const keyId = privateKeyToAccount(privateKey).address
  writeFileSync(path, `${JSON.stringify({ keyId, privateKey, createdAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  chmodSync(path, 0o600)
  const desk = (values.desk ?? process.env['LEASH_DESK_URL'] ?? DEFAULT_DESK).replace(/\/+$/, '')
  const authorizeAt = `${desk}/#/agents`
  if (values.json) console.log(JSON.stringify({ keyId, keyFile: path, authorizeAt }))
  else
    console.log(`key id ${keyId}\nkey file ${path} (mode 600)\nAuthorize this key id in the desk: ${authorizeAt}\nChoose "I run it", paste the key id, then sign the authorization with your team key.`)
}

function readKey(path: string): { keyId: Address; privateKey: Hex } {
  if (!existsSync(path)) throw new UsageError(`${path} not found. Run \`leash-agent init\` first.`)
  if ((statSync(path).mode & 0o077) !== 0) throw new UsageError(`${path} is readable by other users. Run chmod 600 on it.`)
  const file = JSON.parse(readFileSync(path, 'utf8')) as { privateKey?: unknown }
  if (typeof file.privateKey !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(file.privateKey)) throw new UsageError(`${path} does not hold an agent key`)
  const privateKey = file.privateKey as Hex
  return { keyId: privateKeyToAccount(privateKey).address, privateKey }
}

async function pay(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      team: { type: 'string' },
      api: { type: 'string' },
      network: { type: 'string', default: 'moderato' },
      method: { type: 'string' },
      data: { type: 'string' },
      key: { type: 'string', default: DEFAULT_KEY_FILE },
      json: { type: 'boolean' },
    },
  })
  const url = positionals[0]
  if (!url || positionals.length !== 1) throw new UsageError('pay takes exactly one url')
  if (!/^https?:\/\//.test(url)) throw new UsageError('the url must start with http:// or https://')
  if (!values.team || !isAddress(values.team, { strict: false })) throw new UsageError('--team must be the team account address')
  const team = getAddress(values.team)
  const api = values.api ?? process.env['LEASH_API_URL'] ?? DEFAULT_API
  if (values.network !== 'moderato' && values.network !== 'mainnet') throw new UsageError("--network must be 'moderato' or 'mainnet'")
  const network = values.network
  const { keyId, privateKey } = readKey(values.key!)
  const teamNetwork = await fetchTeamNetwork(api, team)
  if (teamNetwork !== network) throw new UsageError(`team ${team} runs on ${teamNetwork} but --network is ${network}. Pass --network ${teamNetwork}.`)

  let blocked: ReadonlySet<string> = new Set()
  try {
    blocked = await fetchBlocked(api, team)
  } catch (e) {
    console.error(`leash-agent: could not read the desk block list (${(e as Error).message}). The chain still enforces every cut.`)
  }

  let desk: { accepted: true; outcome: string; seq: number } | { rejected: string } | null = null
  const leashFetch = createLeashFetch({
    network: agentNetwork(network),
    agent: agentAccount(privateKey, team),
    blocked: () => blocked,
    onRecord: async (record) => {
      try {
        desk = await postRecord(api, privateKey, record)
      } catch (e) {
        desk = { rejected: (e as Error).message }
      }
    },
  })
  const method = (values.method ?? (values.data === undefined ? 'GET' : 'POST')).toUpperCase()
  const init: RequestInit = { method, ...(values.data === undefined ? {} : { body: values.data, headers: { 'content-type': 'application/json' } }) }
  const { response, record } = await leashFetch(url, init)
  const text = response ? await response.text() : null

  if (values.json) console.log(JSON.stringify({ keyId, status: response?.status ?? null, body: text, record, desk }))
  else {
    console.log(`key ${keyId} paid for ${method} ${url}`)
    console.log(`HTTP ${response?.status ?? 'none'}${text === null ? '' : `\n${text.slice(0, MAX_BODY_PRINT)}`}`)
    console.log(`delivery record\n${JSON.stringify(record, null, 2)}`)
    console.log(`desk ${JSON.stringify(desk)}`)
  }
  const result = desk as { rejected?: string } | null
  if (!result || result.rejected !== undefined) {
    console.error(`leash-agent: the desk did not take the record: ${result?.rejected ?? 'no answer'}`)
    process.exitCode = 2
  }
}

const [command, ...rest] = process.argv.slice(2)
try {
  if (command === 'init') init(rest)
  else if (command === 'pay') await pay(rest)
  else {
    console.log(USAGE)
    if (command && command !== 'help' && command !== '--help') process.exitCode = 1
  }
} catch (e) {
  console.error(`leash-agent: ${e instanceof UsageError ? e.message : ((e as { shortMessage?: string }).shortMessage ?? (e as Error).message)}`)
  process.exitCode = e instanceof UsageError ? 1 : 3
}
