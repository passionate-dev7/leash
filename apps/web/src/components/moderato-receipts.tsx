import { Card, Chip, Hash, SectionHead } from '@/components/kit'
import { txUrl } from '@/lib/config'

/**
 * Real Moderato (chain 42431) transactions. Each hash was read back with eth_getTransactionReceipt
 * from https://rpc.moderato.tempo.xyz on 12 Oct 2026: status 0x1 and the block shown.
 * Sources: docs/audit/adversarial-2026-10-12-run3.txt (first two), docs/audit/e2e.log (the cut).
 */
const RECEIPTS = [
  {
    id: 'authorize',
    run: 'Adversarial run 3, 12 Oct 2026',
    title: 'authorizeKey: the agent key and its scope land on chain',
    tx: '0x3403977b56a913bc4c7cc3aff9c8d3ed5eb3e0404e39130d91a6035087815e0b',
    block: 39221586,
    note: 'The compiled policy is read back from the chain: one allowed recipient, one selector, a 50 USDC budget.',
  },
  {
    id: 'payment',
    run: 'Adversarial run 3, 12 Oct 2026',
    title: 'A sponsored access-key payment inside that scope',
    tx: '0x360e5c451d5b715f5831087bcba07e0a6d24863e5e49d8de42e1309e4cb0d2a3',
    block: 39221593,
    note: 'The agent key pays the allowed merchant 1.00. The public relay pays gas and the budget moves by exactly 1.00.',
  },
  {
    id: 'cut',
    run: 'End-to-end run, a separate team',
    title: 'The cut, then CallNotAllowed',
    tx: '0xdea73a4b4821fd9234ec0b644216c6892b3902052f5fd958eebcbf9bed4ecb0c',
    block: 39084936,
    note: 'One transaction removes the vendor from the agent keys. Both agents then try the vendor again and the chain answers CallNotAllowed (e2e.log lines 60 and 61). A refused call has no transaction, so the cut is the receipt.',
  },
] as const

export function ModeratoReceipts() {
  return (
    <section aria-labelledby="receipts-h" className="grid gap-6">
      <SectionHead id="receipts-h" eyebrow="Moderato testnet · public explorer" title="Receipts you can open"
        intro="Real transactions on Tempo Moderato. Each link opens the hash on the Tempo testnet explorer." />
      <Card className="overflow-hidden">
        <ul className="divide-y divide-hairline">
          {RECEIPTS.map((r) => (
            <li key={r.id} className="grid gap-2 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-body font-semibold">{r.title}</p><p className="mt-0.5 text-body-sm text-ink-subtle">{r.run}</p></div>
                <Chip tone="paid">Success</Chip>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-subtle">
                <Hash value={r.tx} a={10} b={6} href={txUrl(r.tx)} />
                <span>Block <span className="num text-ink-muted">{r.block.toLocaleString()}</span></span>
              </div>
              <p className="text-body-sm text-ink-muted">{r.note}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}
