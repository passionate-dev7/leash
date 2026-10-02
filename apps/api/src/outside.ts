import { loadVet402Feed } from '@leash/sdk'
import type { OutsideFeed } from '@leash/sdk'

const CACHE_MS = 30 * 60_000

export type OutsideResult = OutsideFeed & { cachedAt: string; stale: boolean; error: string | null }

let cached: { at: number; feed: OutsideFeed } | undefined
let inflight: Promise<OutsideResult> | undefined

/** vet402's published Tempo mainnet ledger, every row verified on chain. Cached 30 minutes; on a failed refresh the last good copy is served with the error noted. */
export function outsideFeed(): Promise<OutsideResult> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve({ ...cached.feed, cachedAt: new Date(cached.at).toISOString(), stale: false, error: null })
  inflight ??= (async () => {
    try {
      const feed = await loadVet402Feed()
      cached = { at: Date.now(), feed }
      return { ...feed, cachedAt: new Date(cached.at).toISOString(), stale: false, error: null }
    } catch (e) {
      if (!cached) throw e
      return { ...cached.feed, cachedAt: new Date(cached.at).toISOString(), stale: true, error: (e as Error).message.split('\n')[0]! }
    } finally {
      inflight = undefined
    }
  })()
  return inflight
}
