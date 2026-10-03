import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { accountFor, createSigner, forgetSigner, getActive, listSigners, setActive } from './signer'
import type { SignerKind, StoredSigner } from './signer'
import { rootClient } from './chain'
import type { RootClient } from './chain'
import { api, ApiError, deskAuth } from './api'
import { NetworkProvider } from './network'
import type { NetworkName } from './config'

type Session = {
  signers: StoredSigner[]
  active: StoredSigner | null
  /** The network of the active team. */
  network: NetworkName
  client: RootClient | null
  loadError: string | null
  registerError: string | null
  create: (kind: SignerKind, label: string, network: NetworkName) => Promise<StoredSigner>
  select: (address: Address) => void
  forget: (address: Address) => void
}

const Ctx = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [signers, setSigners] = useState<StoredSigner[]>(() => listSigners())
  const [activeAddress, setActiveAddress] = useState<Address | null>(() => getActive())
  const [client, setClient] = useState<RootClient | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [registerError, setRegisterError] = useState<string | null>(null)

  const active = useMemo(
    () => signers.find((s) => s.address.toLowerCase() === activeAddress?.toLowerCase()) ?? null,
    [signers, activeAddress],
  )

  const network: NetworkName = active?.network ?? 'moderato'

  useEffect(() => {
    let live = true
    setClient(null)
    setLoadError(null)
    if (!active) return
    accountFor(active)
      .then((account) => live && setClient(rootClient(account, network)))
      .catch((error: unknown) => live && setLoadError(error instanceof Error ? error.message : String(error)))
    return () => {
      live = false
    }
  }, [active, network])

  // A team the API does not know yet is registered with the team key's signature, so one created while the API was down is registered on the next load. A known team is left alone: no prompt on reload.
  useEffect(() => {
    if (!active || !client) return
    let live = true
    setRegisterError(null)
    api
      .ledger(active.address, 1)
      .then(
        () => undefined,
        (e: unknown) => {
          if (e instanceof ApiError && e.status === 404) return api.upsertTeam(active.address, active.label, active.kind, network, deskAuth(client, network))
          throw e
        },
      )
      .catch((e: unknown) => live && setRegisterError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [active, network, client])

  const create = useCallback(async (kind: SignerKind, label: string, network: NetworkName) => {
    const stored = await createSigner(kind, label, network)
    setSigners(listSigners())
    setActiveAddress(stored.address)
    return stored
  }, [])

  const select = useCallback((address: Address) => {
    setActive(address)
    setActiveAddress(address)
  }, [])

  const forget = useCallback((address: Address) => {
    forgetSigner(address)
    setSigners(listSigners())
    setActiveAddress(getActive())
  }, [])

  const value = useMemo(
    () => ({ signers, active, network, client, loadError, registerError, create, select, forget }),
    [signers, active, network, client, loadError, registerError, create, select, forget],
  )
  return (
    <Ctx.Provider value={value}>
      <NetworkProvider network={network}>{children}</NetworkProvider>
    </Ctx.Provider>
  )
}

export function useSession(): Session {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSession outside SessionProvider')
  return value
}

/** Polls a loader on an interval and exposes the latest value, error and a manual reload. */
export function usePoll<T>(load: (() => Promise<T>) | null, intervalMs: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!load) {
      setData(null)
      return
    }
    let live = true
    let timer: ReturnType<typeof setTimeout>
    const run = async () => {
      setLoading(true)
      try {
        const next = await load()
        if (live) {
          setData(next)
          setError(null)
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (live) {
          setLoading(false)
          if (intervalMs > 0) timer = setTimeout(run, intervalMs)
        }
      }
    }
    void run()
    return () => {
      live = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, intervalMs])
  return { data, error, loading, reload: () => setTick((t) => t + 1) }
}
