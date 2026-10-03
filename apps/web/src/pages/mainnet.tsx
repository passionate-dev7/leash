import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import type { MainnetEvidence, MainnetEvidenceRow, MainnetReplay } from '@/lib/api'
import { usePoll } from '@/lib/session'
import { mainnetAddressUrl } from '@/lib/config'
import { short, units } from '@/lib/format'
import { Empty, Notice, TxLink } from '@/components/ui/status'
import { PageHead } from '@/components/page'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'

const WINDOWS = [
  { blocks: 5_000, label: '5,000 blocks' },
  { blocks: 20_000, label: '20,000 blocks' },
  { blocks: 50_000, label: '50,000 blocks' },
]

const FIRST = 12
const stamp = (iso: string) => iso.replace('T', ' ').slice(5, 16)

function Tile({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="bg-surface-1 p-4">
      <p className="text-caption text-ink-muted">{label}</p>
      <div className="num mt-2 text-card-title font-light">{children}</div>
      {note && <p className="mt-1 text-caption text-ink-subtle">{note}</p>}
    </div>
  )
}

function Tiles({ replay }: { replay: MainnetReplay }) {
  return (
    <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline md:grid-cols-4">
      <Tile label="Charges" note={`${stamp(replay.fromTime)} to ${stamp(replay.toTime)} UTC`}>
        {replay.charges.toLocaleString()}
      </Tile>
      <Tile label="Payers" note={replay.untaggedCharges > 0 ? `${replay.untaggedCharges} charges carry no MPP memo` : 'distinct paying accounts'}>
        {replay.payers.toLocaleString()}
      </Tile>
      <Tile label="Volume">
        <p>{units(replay.volume.usdce)} <span className="text-caption text-ink-muted">USDC.e</span></p>
        <p>{units(replay.volume.ousd)} <span className="text-caption text-ink-muted">OUSD</span></p>
      </Tile>
      <Tile label="Payouts" note={`of ${replay.payoutsCatalogued} catalogued addresses`}>
        {replay.payouts.length}
      </Tile>
    </div>
  )
}

type Block = {
  payout: string
  names: string[]
  replay: { charges: number; payers: number; blocks: number } | null
  vet402: MainnetEvidenceRow['vet402'] | null
  cutTakes: number | null
  servers: { fingerprint: string; charges: number }[]
}

function PayoutBlock({ b }: { b: Block }) {
  const [first, ...rest] = b.names
  return (
    <article className="border border-hairline">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline bg-surface-1 px-4 py-3">
        <h3 className="text-body-sm font-semibold">{b.names.length === 0 ? 'Service not listed' : b.names.length > 3 ? `${b.names.slice(0, 3).join(', ')} and ${b.names.length - 3} more` : b.names.join(', ')}</h3>
        <a href={mainnetAddressUrl(b.payout)} target="_blank" rel="noreferrer" className="num text-caption text-primary hover:underline" title={b.payout}>
          {short(b.payout, 8, 6)}
        </a>
      </header>
      <div className="grid gap-px bg-hairline md:grid-cols-2">
        <div className="bg-canvas p-4">
          <p className="text-caption font-semibold text-ink-muted">Charges seen on chain</p>
          {b.replay ? (
            <p className="mt-2 text-body-sm">
              <span className="num text-card-title font-light">{b.replay.charges.toLocaleString()}</span> charges from <span className="num">{b.replay.payers.toLocaleString()}</span> payers
              <span className="text-ink-muted">, last {b.replay.blocks.toLocaleString()} blocks</span>
            </p>
          ) : (
            <p className="mt-2 text-body-sm text-ink-subtle">No MPP charge in this window.</p>
          )}
          {b.servers.length > 0 && (
            <p className="num mt-2 flex flex-wrap gap-x-4 text-caption text-ink-muted">
              {b.servers.map((s) => (
                <span key={s.fingerprint} className="whitespace-nowrap">{short(s.fingerprint, 6, 4)} x{s.charges}</span>
              ))}
            </p>
          )}
        </div>
        <div className="bg-canvas p-4">
          <p className="text-caption font-semibold text-ink-muted">Verified by vet402</p>
          {b.vet402 && b.vet402.paid > 0 ? (
            <>
              <p className="mt-2 text-body-sm">
                <span className="num">{b.vet402.paid}</span> paid, <span className="num">{b.vet402.delivered}</span> delivered,{' '}
                <span className={cn('num', b.vet402.paidNotDelivered > 0 && 'font-semibold text-error-ink')}>{b.vet402.paidNotDelivered}</span> paid but not delivered
              </p>
              {b.vet402.txs.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption">
                  {b.vet402.txs.map((tx) => (
                    <TxLink key={tx} hash={tx} />
                  ))}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-body-sm text-ink-subtle">No vet402 rows for this payout.</p>
          )}
        </div>
      </div>
      {first && rest.length > 0 && (
        <footer className="border-t border-hairline px-4 py-3 text-body-sm">
          A key scoped to <span className="font-semibold">{first}</span> can also pay: <span className="text-ink-muted">{rest.join(', ')}</span>.
          {b.cutTakes !== null && <span className="text-ink-muted"> One cut takes {b.cutTakes} services with it.</span>}
        </footer>
      )}
    </article>
  )
}

function blocks(replay: MainnetReplay, evidence: MainnetEvidence | null): Block[] {
  const nameOf = new Map(replay.payouts.flatMap((p) => p.services.map((s) => [s.serviceId, s.name] as const)))
  const byPayout = new Map(replay.payouts.map((p) => [p.payout.toLowerCase(), p]))
  if (!evidence) {
    return replay.payouts.map((p) => ({
      payout: p.payout,
      names: p.services.map((s) => s.name),
      replay: { charges: p.charges, payers: p.payers, blocks: replay.blocks },
      vet402: null,
      cutTakes: p.services.length,
      servers: p.servers,
    }))
  }
  return evidence.payouts.map((e) => ({
    payout: e.payout,
    names: e.services.map((id) => nameOf.get(id) ?? id),
    replay: e.replay.charges > 0 ? { charges: e.replay.charges, payers: e.replay.payers, blocks: e.replay.window.blocks } : null,
    vet402: e.vet402,
    cutTakes: e.cutTakes,
    servers: byPayout.get(e.payout.toLowerCase())?.servers ?? [],
  }))
}

export function MainnetPage() {
  const [span, setSpan] = useState(20_000)
  const replay = usePoll(() => api.mainnet(span), 0, [span])
  const evidence = usePoll(() => api.mainnetEvidence(span), 0, [span])
  const data = replay.data && replay.data.blocks === span ? replay.data : null
  const stale = replay.loading || !data
  const [all, setAll] = useState(false)
  const list = useMemo(() => (replay.data ? blocks(replay.data, evidence.data) : []), [replay.data, evidence.data])
  const shown = all ? list : list.slice(0, FIRST)

  return (
    <>
      <PageHead title="Mainnet replay">
        What agents already pay for on Tempo mainnet. Leash reads TransferWithMemo logs to every catalogued MPP payout address, then sets vet402's verified delivery record beside them. Read-only: nothing here signs or sends.
      </PageHead>
      <div role="tablist" aria-label="Window" className="mb-6 flex overflow-x-auto border-b border-hairline">
        {WINDOWS.map((w) => (
          <button
            key={w.blocks}
            type="button"
            role="tab"
            aria-selected={span === w.blocks}
            onClick={() => setSpan(w.blocks)}
            className={cn('whitespace-nowrap border-b-2 px-5 py-3 text-body-sm', span === w.blocks ? 'border-primary font-semibold text-ink' : 'border-transparent text-ink-muted hover:bg-surface-1')}
          >
            Last {w.label}
          </button>
        ))}
      </div>
      {replay.error && <Notice tone="error" title="Could not replay mainnet">{replay.error}</Notice>}
      {replay.loading && <p className="mb-4 text-body-sm text-ink-muted" aria-live="polite">Reading mainnet logs in pages of 5,000 blocks. A fresh window can take a few seconds, then it is cached for ten minutes.</p>}
      {replay.data && (
        <div className={cn('grid gap-6', stale && 'opacity-60')}>
          <Tiles replay={replay.data} />
          {evidence.error && <Notice tone="warning" title="vet402 evidence is unavailable">{evidence.error}</Notice>}
          {list.length === 0 ? (
            <Empty title="No MPP charge landed in this window">Pick a larger window above. {replay.data.silentPayouts} catalogued payout addresses were silent in these blocks.</Empty>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {shown.map((b) => (
                <PayoutBlock key={b.payout} b={b} />
              ))}
            </div>
          )}
          {list.length > FIRST && (
            <div>
              <Button variant="tertiary" onClick={() => setAll((v) => !v)}>
                {all ? `Show the first ${FIRST} payouts` : `Show all ${list.length} payouts`}
              </Button>
            </div>
          )}
          <p className="text-caption text-ink-subtle">
            Read from Tempo mainnet (chain 4217), blocks <span className="num">{replay.data.fromBlock.toLocaleString()}</span> to <span className="num">{replay.data.toBlock.toLocaleString()}</span>, head <span className="num">{replay.data.head.toLocaleString()}</span>, {replay.data.pages} log page{replay.data.pages === 1 ? '' : 's'}.
          </p>
        </div>
      )}
    </>
  )
}
