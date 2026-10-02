import type { Address } from 'viem'
import type { CallScope } from './types.js'

export type CutResult = {
  scopes: CallScope[]
  /** True when the recipient appeared in at least one rule, so the key actually changes. */
  changed: boolean
  /**
   * True when nothing callable remains. The caller must revoke the key instead of writing an
   * empty scope set: an empty `recipients` list on a rule means "any recipient", so a rule is
   * dropped rather than emptied, and a key left with no rules is better revoked than trusted to
   * read as deny-all.
   */
  empty: boolean
}

/** The key's scope set with one recipient removed from every rule. */
export function removeRecipient(scopes: readonly CallScope[], recipient: Address): CutResult {
  const r = recipient.toLowerCase()
  let changed = false
  const next: CallScope[] = []
  for (const scope of scopes) {
    const rules = []
    for (const rule of scope.selectorRules) {
      if (rule.recipients.length === 0) {
        rules.push(rule)
        continue
      }
      const kept = rule.recipients.filter((x) => x.toLowerCase() !== r)
      if (kept.length !== rule.recipients.length) changed = true
      if (kept.length > 0) rules.push({ ...rule, recipients: kept })
    }
    if (rules.length > 0) next.push({ ...scope, selectorRules: rules })
  }
  return { scopes: next, changed, empty: next.length === 0 }
}

/** Rules that still allow any recipient: a cut cannot reach a key that has one. */
export function unboundedRules(scopes: readonly CallScope[]): CallScope[] {
  return scopes.filter((s) => s.selectorRules.length === 0 || s.selectorRules.some((r) => r.recipients.length === 0))
}
