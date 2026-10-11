import { describe, expect, it } from 'vitest'
import { decideCuts, judgeDelivery } from '../../src/delivery-cut.js'

// Real third-party pattern: fal.mpp.tempo.xyz quoted 3000 (0.003 USDC.e) to recipient 0xca4e...79Fe for an
// empty-body FLUX schnell request (captured 2026-10-10 IST); tempoxyz/mpp#1034 reports fal settling then 422.
const FAL = '0xca4e835F803cB0b7C428222B3A3B98518d4779Fe'
const SS = '0x07F067959297767c887dbfA3C72379c66E82a045'
const tx = (n: number) => `0x${n.toString(16).padStart(64, '0')}`

describe('judgeDelivery', () => {
  it('settled then 422 is a non-delivery', () => {
    expect(judgeDelivery({ vendor: 'fal', recipient: FAL, amount: 3000n, settlementTx: tx(1), status: 422 })).toEqual({ delivered: false, reason: 'paid_then_client_error', status: 422 })
  })
  it('2xx is delivery', () => expect(judgeDelivery({ vendor: 'fal', recipient: FAL, amount: 1n, settlementTx: tx(1), status: 200 }).delivered).toBe(true))
  it('unsettled call is never a cut reason', () => expect(judgeDelivery({ vendor: 'fal', recipient: FAL, amount: 1n, settlementTx: null, status: 422 })).toEqual({ delivered: false, reason: 'not_settled' }))
  it('5xx, 402-after-pay and no response are non-deliveries', () => {
    expect(judgeDelivery({ vendor: 'v', recipient: FAL, amount: 1n, settlementTx: tx(1), status: 503 }).reason).toBe('paid_then_server_error')
    expect(judgeDelivery({ vendor: 'v', recipient: FAL, amount: 1n, settlementTx: tx(1), status: 402 }).reason).toBe('paid_then_payment_required')
    expect(judgeDelivery({ vendor: 'v', recipient: FAL, amount: 1n, settlementTx: tx(1), status: null }).reason).toBe('paid_then_no_response')
  })
})

describe('decideCuts', () => {
  const log = [
    { vendor: 'stablestudio', recipient: SS, amount: 39000n, settlementTx: tx(1), status: 200 },
    { vendor: 'fal', recipient: FAL, amount: 3000n, settlementTx: tx(2), status: 422, body: '{"detail":[{"type":"missing","loc":["body","prompt"]}]}' },
  ]
  it('cuts only the vendor that took payment and did not deliver', () => {
    const d = decideCuts(log)
    expect(d.find((x) => x.vendor === 'fal')).toMatchObject({ cut: true, failures: 1, lost: 3000n })
    expect(d.find((x) => x.vendor === 'stablestudio')).toMatchObject({ cut: false, failures: 0 })
  })
  it('respects strikes and is case-insensitive on recipient', () => {
    const two = [...log, { vendor: 'fal', recipient: FAL.toLowerCase(), amount: 3000n, settlementTx: tx(3), status: 400 }]
    expect(decideCuts(log, { strikes: 2, window: 20 }).find((x) => x.vendor === 'fal')!.cut).toBe(false)
    expect(decideCuts(two, { strikes: 2, window: 20 }).find((x) => x.vendor === 'fal')).toMatchObject({ cut: true, failures: 2, lost: 6000n })
  })
  it('ignores unsettled attempts and rejects strikes < 1', () => {
    expect(decideCuts([{ vendor: 'fal', recipient: FAL, amount: 1n, settlementTx: null, status: 422 }])).toEqual([])
    expect(() => decideCuts(log, { strikes: 0, window: 1 })).toThrow()
  })
})
