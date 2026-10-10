import { describe, expect, it } from 'vitest'
import { decodeFunctionData } from 'viem'
import { Abis, Addresses } from 'viem/tempo'
import { planDeliveryCuts } from '../../src/delivery-cut.js'

const USDCE = '0x20c000000000000000000000b9537d11c60e8b50' as const
const TRANSFER = '0xa9059cbb' as const
const FAL = '0xca4e835F803cB0b7C428222B3A3B98518d4779Fe' as const // real fal.mpp.tempo.xyz 402 recipient
const SS = '0x07F067959297767c887dbfA3C72379c66E82a045' as const // real stablestudio 402 recipient
const K1 = '0x00000000000000000000000000000000000000a1' as const
const K2 = '0x00000000000000000000000000000000000000a2' as const
const tx = (n: number) => `0x${n.toString(16).padStart(64, '0')}`

const keys = [
  { keyId: K1, scopes: [{ target: USDCE, selectorRules: [{ selector: TRANSFER, recipients: [FAL, SS] }] }] },
  { keyId: K2, scopes: [{ target: USDCE, selectorRules: [{ selector: TRANSFER, recipients: [FAL] }] }] },
]
const log = [
  { vendor: 'stablestudio', recipient: SS, amount: 39000n, settlementTx: tx(1), status: 200 },
  { vendor: 'fal', recipient: FAL, amount: 3000n, settlementTx: tx(2), status: 422 },
]

describe('planDeliveryCuts', () => {
  it('one envelope: rescopes the shared key without fal and revokes the fal-only key', () => {
    const [cut, ...rest] = planDeliveryCuts(log, keys)
    expect(rest).toHaveLength(0)
    expect(cut!.decision.vendor).toBe('fal')
    expect(cut!.plan.rescoped).toEqual([K1])
    expect(cut!.plan.revoked).toEqual([K2])
    expect(cut!.plan.calls.every((c) => c.to === Addresses.accountKeychain)).toBe(true)
    const a = decodeFunctionData({ abi: Abis.accountKeychain, data: cut!.plan.calls[0]!.data })
    expect(a.functionName).toBe('setAllowedCalls')
    expect(JSON.stringify(a.args).toLowerCase()).not.toContain(FAL.toLowerCase())
    expect(JSON.stringify(a.args).toLowerCase()).toContain(SS.toLowerCase())
    expect(decodeFunctionData({ abi: Abis.accountKeychain, data: cut!.plan.calls[1]!.data }).functionName).toBe('revokeKey')
  })
  it('plans nothing when every vendor delivered', () => {
    expect(planDeliveryCuts([log[0]!], keys)).toEqual([])
  })
})
