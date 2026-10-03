import { useState } from 'react'
import { balances } from '@/lib/chain'
import { api } from '@/lib/api'
import { useSession, usePoll } from '@/lib/session'
import { passkeySupported } from '@/lib/signer'
import { units } from '@/lib/format'
import { go } from '@/lib/router'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Empty, Notice, Panel, TxLink } from '@/components/ui/status'
import { FleetStrip } from '@/components/fleet'
import { useTeamData } from '@/lib/fleet'
import { PageHead } from '@/components/page'
import { addressUrl } from '@/lib/config'
import type { Hash } from 'viem'

function CreateTeam({ first, onCreated }: { first: boolean; onCreated: () => void }) {
  const { create } = useSession()
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState<'passkey' | 'webcrypto' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: 'passkey' | 'webcrypto') => {
    setBusy(kind)
    setError(null)
    try {
      await create(kind, label.trim())
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  const valid = label.trim().length >= 2

  return (
    <Panel title={first ? 'Create the team account' : 'Add another team account'}>
      <div className="grid gap-8 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Field label="Team name" help="Shown in this browser and stored with the team on the API.">
            {(id) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Research desk" maxLength={40} />}
          </Field>
          <div className="flex flex-wrap gap-0">
            <Button disabled={!valid || !passkeySupported()} busy={busy === 'passkey'} onClick={() => run('passkey')}>
              Create with passkey
            </Button>
            <Button variant="secondary" disabled={!valid} busy={busy === 'webcrypto'} onClick={() => run('webcrypto')}>
              Create browser key
            </Button>
          </div>
          {error && <Notice tone="error" title="Could not create the account">{error}</Notice>}
        </div>
        <dl className="grid content-start gap-4 text-body-sm text-ink-muted">
          <div>
            <dt className="font-semibold text-ink">Passkey</dt>
            <dd>A WebAuthn P-256 credential in your device. Every authorization and cut-off asks for your fingerprint, face or PIN.</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Browser key</dt>
            <dd>A WebCrypto P-256 key created non-extractable and kept in this browser's IndexedDB. Nothing can read it back out, and it signs without a prompt.</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">What the server never gets</dt>
            <dd>The team key. The API only receives the account address and the transaction hashes you produce.</dd>
          </div>
        </dl>
      </div>
    </Panel>
  )
}

function Funding({ address }: { address: `0x${string}` }) {
  const bal = usePoll(() => balances(address), 8000, [address])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ txs: Hash[]; ousd: string; pathusd: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fund = async () => {
    setBusy(true)
    setError(null)
    try {
      setResult(await api.faucet(address))
      bal.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const empty = bal.data && bal.data.ousd === 0n

  return (
    <section aria-label="Balances on chain">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border border-hairline bg-surface-1 px-4 py-3">
        <h2 className="text-body-sm font-semibold max-md:w-full">Balances</h2>
        <p className="text-body-sm text-ink-muted">
          OUSD <span className="num ml-1 text-ink">{bal.data ? units(bal.data.ousd) : '...'}</span>
        </p>
        <p className="text-body-sm text-ink-muted">
          PathUSD <span className="num ml-1 text-ink">{bal.data ? units(bal.data.pathusd) : '...'}</span>
        </p>
        {bal.data && <span className="text-caption text-ink-subtle">read at block <span className="num">{bal.data.block.toString()}</span></span>}
        <Button className="md:ml-auto" size="sm" variant={empty ? 'primary' : 'ghost'} busy={busy} onClick={fund}>
          {empty ? 'Fund from the Moderato faucet' : 'Request faucet funds again'}
        </Button>
      </div>
      {empty && !result && <p className="mt-2 text-caption text-ink-muted">The faucet sends 1,000,000 OUSD and PathUSD. OUSD is what agents pay with. PathUSD pays the gas for each signature you make here.</p>}
      {bal.error && <div className="mt-4"><Notice tone="error" title="Could not read balances">{bal.error}</Notice></div>}
      {error && <div className="mt-4"><Notice tone="error" title="Faucet refused">{error}</Notice></div>}
      {result && (
        <div className="mt-4">
          <Notice tone="success" title={`Funded: ${units(result.ousd)} OUSD and ${units(result.pathusd)} PathUSD`}>
            <span className="flex flex-wrap gap-x-4">
              {result.txs.map((tx) => (
                <TxLink key={tx} hash={tx} />
              ))}
            </span>
            <span className="mt-2 block">
              Next: <a className="text-primary hover:underline" href="#/agents" onClick={() => go('agents')}>add an agent</a>.
            </span>
          </Notice>
        </div>
      )}
    </section>
  )
}

export function TeamPage() {
  const { active, signers, select, forget, loadError, registerError } = useSession()
  const [adding, setAdding] = useState(false)
  const fleet = useTeamData(active?.address ?? null)

  return (
    <>
      <PageHead title={active ? active.label : 'Team account'}>
        The team account is the root that owns every agent key. It signs key authorizations and vendor cut-offs from this browser. Agents get limits and recipient scopes, never the root.
      </PageHead>
      <div className="grid gap-6">
        {!active || adding ? <CreateTeam first={!active} onCreated={() => setAdding(false)} /> : null}
        {active && (
          <>
            {registerError && <Notice tone="error" title="The API has not registered this team">{registerError}</Notice>}
            <FleetStrip
              data={fleet}
              empty={
                <Empty title="No agents hold a key yet" action={<Button onClick={() => go('agents')}>Add an agent</Button>}>
                  Fund the team below, then add an agent: pick the services it may pay and a daily budget. Its spend, failures and refusals appear here.
                </Empty>
              }
            />
            <Funding address={active.address} />
            <Panel
              title={active.label}
              aside={
                <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
                  {adding ? 'Cancel' : 'New team account'}
                </Button>
              }
            >
              <dl className="grid gap-4 text-body-sm sm:grid-cols-[160px_minmax(0,1fr)]">
                <dt className="text-ink-muted">Account address</dt>
                <dd className="num break-all">
                  <a href={addressUrl(active.address)} target="_blank" rel="noreferrer" className="text-primary hover:underline">{active.address}</a>
                </dd>
                <dt className="text-ink-muted">Signer</dt>
                <dd>{active.kind === 'passkey' ? 'Passkey (WebAuthn P-256)' : 'Browser key (WebCrypto P-256, non-extractable, IndexedDB)'}</dd>
                <dt className="text-ink-muted">Key status</dt>
                <dd>{loadError ?? 'Loaded in this browser'}</dd>
              </dl>
              {signers.length > 1 && (
                <ul className="mt-6 divide-y divide-hairline border-t border-hairline">
                  {signers.map((s) => (
                    <li key={s.address} className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-sm">
                      <span>
                        {s.label} <span className="num text-ink-muted">{s.address.slice(0, 10)}...</span>
                        {s.address === active.address && <span className="ml-2 text-ink-subtle">active</span>}
                      </span>
                      <span className="flex">
                        {s.address !== active.address && <Button size="sm" variant="ghost" onClick={() => select(s.address)}>Use</Button>}
                        <Button size="sm" variant="ghost" onClick={() => forget(s.address)}>Forget on this device</Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </div>
    </>
  )
}
