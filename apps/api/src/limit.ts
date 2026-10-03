/** A token bucket per key: `capacity` calls at once, refilled at `perSecond`. In memory, so one bucket set per process. */
export function createRateLimiter(opts: { capacity: number; perSecond: number; maxKeys?: number; now?: () => number }) {
  const { capacity, perSecond, maxKeys = 10_000, now = Date.now } = opts
  const buckets = new Map<string, { tokens: number; at: number }>()
  return {
    /** Takes one token for `key`. False when the bucket is empty. */
    take(key: string): boolean {
      const t = now()
      const b = buckets.get(key) ?? { tokens: capacity, at: t }
      b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 1000) * perSecond)
      b.at = t
      // Re-insert so the Map's first entry is always the least recently used key.
      buckets.delete(key)
      buckets.set(key, b)
      if (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value as string)
      if (b.tokens < 1) return false
      b.tokens -= 1
      return true
    },
  }
}
