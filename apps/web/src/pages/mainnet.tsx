import { useState } from 'react'
import { api } from '@/lib/api'
import { usePoll } from '@/lib/session'
import { mainnetAddressUrl } from '@/lib/config'
import { short, units } from '@/lib/format'
import { Empty, Notice } from '@/components/ui/status'
import { PageHead, Cell, Th } from '@/components/page'
import { cn } from '@/components/ui/cn'

const WINDOWS = [
  { blocks: 5_000, label: '5,000 blocks' },
  { blocks: 20_000, label: '20,000 blocks' },
  { blocks: 50_000, label: '50,000 blocks' },
]

const stamp = (iso: string) => iso.replace('T', ' ').slice(0, 16) + ' UTC'

export function MainnetPage() {
  const [blocks, setBlocks] = useState(20_000)
  const replay = usePoll(() => api.mainnet(blocks), 0, [blocks])
  const data = replay.data && replay.data.blocks === blocks ? replay.data : null
  const stale = replay.loading || !data

  return (
    <>
      <PageHead title="Mainnet replay">
        What agents already pay for on Tempo mainnet. Leash reads TransferWithMemo logs to every catalogued MPP payout address and groups them by payout and by the mppx server that tagged the memo. Read-only: nothing here signs or sends.
      </PageHead>
      <div role="tablist" aria-label="Window" className="mb-6 flex overflow-x-auto border-b border-hairline">
        {WINDOWS.map((w) => (
          <button
            key={w.blocks}
            type="button"
            role="tab"
            aria-selected={blocks === w.blocks}
            onClick={() => setBlocks(w.blocks)}
            className={cn('whitespace-nowrap border-b-2 px-5 py-3 text-body-sm', blocks === w.blocks ? 'border-primary font-semibold text-ink' : 'border-transparent text-ink-muted hover:bg-surface-1')}
          >
            Last {w.label}
          </button>
        ))}
      </div>
      {replay.error && <Notice tone="error" title="Could not replay mainnet">{replay.error}</Notice>}
      {replay.loading && <p className="mb-4 text-body-sm text-ink-muted" aria-live="polite">Reading mainnet logs in pages of 5,000 blocks. A fresh window can take a few seconds, then it is cached for ten minutes.</p>}
      {replay.data && (
        <div className={cn(stale && 'opacity-60')}>
          <p className="mb-6 max-w-4xl text-body text-ink-muted">
            Blocks <span className="num text-ink">{replay.data.fromBlock.toLocaleString()}</span> to <span className="num text-ink">{replay.data.toBlock.toLocaleString()}</span>, {stamp(replay.data.fromTime)} to {stamp(replay.data.toTime)}.{' '}
            <span className="num text-ink">{replay.data.charges}</span> charges from <span className="num text-ink">{replay.data.payers}</span> payers across{' '}
            <span className="num text-ink">{replay.data.payouts.length}</span> of <span className="num text-ink">{replay.data.payoutsCatalogued}</span> catalogued payout addresses, moving{' '}
            <span className="num text-ink">{units(replay.data.volume.usdce)}</span> USDC.e and <span className="num text-ink">{units(replay.data.volume.ousd)}</span> OUSD.
            {replay.data.untaggedCharges > 0 && <> <span className="num text-ink">{replay.data.untaggedCharges}</span> of the charges carry a memo that is not an MPP attribution memo.</>}
          </p>
          {replay.data.payouts.length === 0 ? (
            <Empty title="No MPP charge landed in this window">Pick a larger window above. {replay.data.silentPayouts} catalogued payout addresses were silent in these blocks.</Empty>
          ) : (
            <div className="overflow-x-auto border border-hairline">
              <table className="w-full min-w-[980px] text-body-sm">
                <thead>
                  <tr>
                    <Th>Payout address</Th>
                    <Th>Services behind it</Th>
                    <Th className="text-right">Charges</Th>
                    <Th className="text-right">Payers</Th>
                    <Th className="text-right">USDC.e</Th>
                    <Th className="text-right">OUSD</Th>
                    <Th>Charges per mppx server</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {replay.data.payouts.map((p) => (
                    <tr key={p.payout}>
                      <Cell>
                        <a href={mainnetAddressUrl(p.payout)} target="_blank" rel="noreferrer" className="num text-primary hover:underline" title={p.payout}>{short(p.payout, 8, 6)}</a>
                      </Cell>
                      <Cell>
                        {p.services.length === 0 ? (
                          <span className="text-ink-subtle">not yet mapped to a service</span>
                        ) : (
                          <>
                            <span className="num text-ink-muted">{p.services.length} service{p.services.length === 1 ? '' : 's'}</span>
                            <p className="text-caption text-ink-muted">{p.services.map((s) => s.name).join(', ')}</p>
                          </>
                        )}
                      </Cell>
                      <Cell className="num text-right">{p.charges}</Cell>
                      <Cell className="num text-right">{p.payers}</Cell>
                      <Cell className="num text-right">{units(p.volume.usdce)}</Cell>
                      <Cell className="num text-right">{units(p.volume.ousd)}</Cell>
                      <Cell className="num text-caption">
                        {p.servers.length === 0 ? <span className="text-ink-subtle">untagged</span> : p.servers.map((s) => `${short(s.fingerprint, 6, 4)} x${s.charges}`).join('  ')}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-caption text-ink-subtle">Read from Tempo mainnet (chain 4217) at head block <span className="num">{replay.data.head.toLocaleString()}</span> using {replay.data.pages} log page{replay.data.pages === 1 ? '' : 's'}.</p>
        </div>
      )}
    </>
  )
}
