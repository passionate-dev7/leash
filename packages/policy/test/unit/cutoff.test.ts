import { describe, expect, it } from 'vitest'
import { removeRecipient, unboundedRules } from '../../src/cutoff.js'
import type { CallScope } from '../../src/types.js'

const USD = '0x20c0000000000000000000000000000000000000' as const
const TWM = '0x95777d59' as const
const A = '0x52e26e0efdfdfdfdfdfdfdfdfdfd000000000001'
const B = '0x52e26e0efdfdfdfdfdfdfdfdfdfd000000000002'
const C = '0x3Ea86ae0B21C583772514e98dcD0943c19D4daf4'

describe('removeRecipient', () => {
  it('drops one recipient and keeps the rest', () => {
    const out = removeRecipient([{ target: USD, selectorRules: [{ selector: TWM, recipients: [A, B, C] }] }], B)
    expect(out.changed).toBe(true)
    expect(out.empty).toBe(false)
    expect(out.scopes).toEqual([{ target: USD, selectorRules: [{ selector: TWM, recipients: [A, C] }] }])
  })

  it('matches addresses case-insensitively', () => {
    const out = removeRecipient([{ target: USD, selectorRules: [{ selector: TWM, recipients: [C] , }] }, { target: USD, selectorRules: [{ selector: TWM, recipients: [A] }] }], C.toLowerCase() as `0x${string}`)
    expect(out.changed).toBe(true)
    expect(out.scopes).toEqual([{ target: USD, selectorRules: [{ selector: TWM, recipients: [A] }] }])
  })

  it('drops a rule instead of emptying it, because empty recipients means any recipient', () => {
    const out = removeRecipient([{ target: USD, selectorRules: [{ selector: TWM, recipients: [B] }] }], B)
    expect(out.scopes).toEqual([])
    expect(out.empty).toBe(true)
  })

  it('reports no change when the recipient is not scoped', () => {
    const out = removeRecipient([{ target: USD, selectorRules: [{ selector: TWM, recipients: [A] }] }], B)
    expect(out.changed).toBe(false)
  })

  it('leaves unbounded rules alone and flags them', () => {
    const scopes: CallScope[] = [{ target: USD, selectorRules: [{ selector: TWM, recipients: [] }] }]
    expect(removeRecipient(scopes, B).changed).toBe(false)
    expect(unboundedRules(scopes)).toHaveLength(1)
  })
})
