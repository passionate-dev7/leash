import type { Address, Hex } from 'viem'
import { Account } from 'viem/tempo'
import { createLeashFetch } from '@leash/sdk'
import type { DeliveryRecord } from '@leash/sdk'
import { AGENT_NETWORK } from './config.js'
import { HttpError, conflict } from './http.js'
import { buildRequest, entryOf } from './services.js'
import type { AgentRow, Store } from './store.js'

const BODY_PREVIEW_CHARS = 4_000

export type CallResult = {
  record: DeliveryRecord & { agentName: string; vendorId: string; serviceId: string }
  /** The vendor's answer, as text, cut to BODY_PREVIEW_CHARS. Null when nothing came back. */
  body: string | null
  json: unknown
}

export function createRunner(store: Store) {
  const running = new Set<string>()

  /** One in-flight payment per team account: agent keys sign as the team account, so two at once would race its nonce. */
  async function exclusive<T>(agent: AgentRow, fn: () => Promise<T>): Promise<T> {
    if (running.has(agent.account)) throw conflict('run_in_progress', `another payment for this team is already in flight`)
    running.add(agent.account)
    try {
      return await fn()
    } finally {
      running.delete(agent.account)
    }
  }

  async function paidCall(agent: AgentRow, serviceId: string, input: unknown): Promise<CallResult> {
    if (agent.status !== 'active') throw conflict('agent_not_active', `agent ${agent.key_id} is ${agent.status}`)
    const entry = entryOf(serviceId)
    if (!(JSON.parse(agent.service_ids) as string[]).includes(serviceId))
      throw new HttpError(403, 'not_in_scope', `agent ${agent.name} was not given ${serviceId}`)
    const { url, init } = buildRequest(entry, input)
    const account = agent.account
    const keyAccount = Account.fromSecp256k1(agent.private_key as Hex, { access: account })
    const ctx = { agentName: agent.name, vendorId: entry.vendorId, serviceId: entry.serviceId }
    let saved: CallResult['record'] | undefined
    const leashFetch = createLeashFetch({
      network: AGENT_NETWORK,
      agent: keyAccount as never,
      blocked: () => store.blocked(account),
      onRecord: (record) => {
        store.insertRecord(record, ctx)
        saved = { ...record, ...ctx }
      },
    })
    const { response, record } = await leashFetch(url, init)
    const full = response ? await response.text() : null
    let json: unknown = null
    if (full !== null) {
      try {
        json = JSON.parse(full)
      } catch {
        json = null
      }
    }
    return { record: saved ?? { ...record, ...ctx }, body: full === null ? null : full.slice(0, BODY_PREVIEW_CHARS), json }
  }

  /**
   * One research task: search the topic, scrape the top story pages, summarize and extract
   * keywords from what came back. Every call is a real payment and is written to the ledger as it
   * finishes. A service the agent was not given is skipped; a service that was cut is attempted
   * and the chain's refusal is recorded.
   */
  async function research(agent: AgentRow, topic: string) {
    const records: CallResult['record'][] = []
    const errors: { serviceId: string; message: string }[] = []
    const scope = new Set(JSON.parse(agent.service_ids) as string[])
    const call = async (serviceId: string, input: unknown): Promise<CallResult | null> => {
      if (!scope.has(serviceId)) return null
      try {
        const result = await paidCall(agent, serviceId, input)
        records.push(result.record)
        return result
      } catch (e) {
        errors.push({ serviceId, message: (e as { shortMessage?: string }).shortMessage ?? (e as Error).message.split('\n')[0]! })
        return null
      }
    }
    return exclusive(agent, async () => {
      const search = await call('atlas-search', { q: topic })
      const stories = Array.isArray(search?.json) ? (search.json as { url?: unknown }[]) : []
      const urls = stories.map((s) => s.url).filter((u): u is string => typeof u === 'string' && u.startsWith('https://')).slice(0, 4)
      for (const url of urls) {
        const page = await call('atlas-scrape', { url })
        const text = (page?.json as { text?: unknown } | null)?.text
        if (page?.record.outcome !== 'delivered' || typeof text !== 'string' || text.length === 0) continue
        await call('relay-summarize', { text })
        await call('relay-keywords', { text })
      }
      return { records, errors }
    })
  }

  return { paidCall: (agent: AgentRow, serviceId: string, input: unknown) => exclusive(agent, () => paidCall(agent, serviceId, input)), research }
}

export type Runner = ReturnType<typeof createRunner>
export type { Address }
