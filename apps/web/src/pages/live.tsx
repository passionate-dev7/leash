import { useEffect, useMemo } from 'react'
import { isAddress } from 'viem'
import type { Address } from 'viem'
import { api } from '@/lib/api'
import { useSession, usePoll } from '@/lib/session'
import { useTeamData } from '@/lib/fleet'
import { go } from '@/lib/router'
import { addressUrl } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Empty, Notice } from '@/components/ui/status'
import { PageHead } from '@/components/page'
import { FleetStrip } from '@/components/fleet'
import { VendorTable } from '@/components/vendors'
import { RecordTable } from '@/components/records'

const LATEST = 8

/** Read-only team view. Needs no signer: the fleet, vendors and ledger are public reads from the API and the chain. */
export function LivePage({ account: param }: { account: string | null }) {
  const { active } = useSession()
  const featured = usePoll(param ? null : () => api.featured(), 0, [param])
  const account: Address | null = param ? (isAddress(param, { strict: false }) ? (param as Address) : null) : (featured.data?.account ?? null)
  const data = useTeamData(account)
  const catalog = usePoll(() => api.catalog(), 0, [])
  const svcById = useMemo(() => new Map((catalog.data?.services ?? []).map((s) => [s.serviceId, s])), [catalog.data])

  // Pin the featured team into the URL so the page can be shared as it is.
  useEffect(() => {
    if (!param && account) history.replaceState(null, '', `#/t/${account}`)
  }, [param, account])

  const label = data.team.data?.team.label
  const rows = data.vendors.data?.services.filter((s) => s.paid > 0 || s.refused > 0 || s.cut) ?? []
  const latest = (data.ledger.data?.records ?? []).slice(0, LATEST)

  const create = (
    <Button onClick={() => go('team')}>{active ? 'Open your team' : 'Create your own team'}</Button>
  )

  if (param && !account) {
    return <Empty title="That is not a team account address" action={create}>A public team link looks like #/t/0x followed by 40 hex characters.</Empty>
  }
  if (!param && featured.error) {
    return <Empty title="No featured team is available" action={create}>The API did not name a team to show: {featured.error}</Empty>
  }

  return (
    <>
      <PageHead title={label ? `${label}` : 'Live team'} actions={create}>
        {account ? (
          <>
            Read-only view of a team that is paying vendors right now. Spend limits are read from Tempo Moderato and every payment links to its settlement transaction. Account{' '}
            <a href={addressUrl(account)} target="_blank" rel="noreferrer" className="num text-primary hover:underline">{account.slice(0, 10)}...{account.slice(-6)}</a>.
          </>
        ) : (
          'Loading the featured team.'
        )}
      </PageHead>
      {account && (
        <div className="grid gap-6">
          {data.team.error && !data.team.data && <Notice tone="error" title="Could not read this team">{data.team.error}</Notice>}
          <FleetStrip
            data={data}
            empty={
              <Empty title="This team has no agents yet" action={create}>Create your own team to give an agent a budget and see its spend here.</Empty>
            }
          />
          {rows.length > 0 && (
            <section>
              <h2 className="mb-3 text-body-sm font-semibold">Vendors this team has paid</h2>
              <VendorTable rows={rows} svcById={svcById} />
            </section>
          )}
          {latest.length > 0 && (
            <section>
              <h2 className="mb-3 text-body-sm font-semibold">Latest {latest.length} payments</h2>
              <RecordTable records={latest} />
            </section>
          )}
        </div>
      )}
    </>
  )
}
