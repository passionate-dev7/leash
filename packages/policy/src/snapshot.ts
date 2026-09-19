import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { RecipientIndex } from './types.js'

/**
 * The committed recipient index. It is a capture, not a source of truth: the compiler
 * re-resolves every recipient before it signs, because a cached payout address across an
 * allowlist rotation is exactly the failure Leash exists to prevent.
 * MPP-CATALOG.md §2, "never trust a cached address across an allowlist rotation".
 */
export const RECIPIENT_INDEX_PATH = fileURLToPath(
  new URL('../data/recipients.4217.json', import.meta.url),
)

let cached: RecipientIndex | undefined

export async function loadRecipientIndex(path = RECIPIENT_INDEX_PATH): Promise<RecipientIndex> {
  if (cached && path === RECIPIENT_INDEX_PATH) return cached
  const text = await readFile(path, 'utf8')
  const index = JSON.parse(text) as RecipientIndex
  if (!Array.isArray(index.resolved))
    throw new Error(`${path} is not a recipient index`)
  if (path === RECIPIENT_INDEX_PATH) cached = index
  return index
}

/** Age of a snapshot in hours, so a UI can say how stale the number it is showing is. */
export function snapshotAgeHours(index: RecipientIndex, now = Date.now()): number {
  return (now - Date.parse(index.capturedAt)) / 3_600_000
}
