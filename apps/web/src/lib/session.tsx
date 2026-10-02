import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { accountFor, createSigner, forgetSigner, getActive, listSigners, setActive } from './signer'
import type { SignerKind, StoredSigner } from './signer'
import { rootClient } from './chain'
import type { RootClient } from './chain'
import { api } from './api'

type Session = {
  signers: StoredSigner[]
  active: StoredSigner | null
  client: RootClient | null
  loadError: string | null
  registerError: string | null
  create: (kind: SignerKind, label: string) => Promise<StoredSigner>
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

  useEffect(() => {
    let live = true
    setClient(null)
    setLoadError(null)
    if (!active) return
    accountFor(active)
      .then((account) => live && setClient(rootClient(account)))
      .catch((error: unknown) => live && setLoadError(error instanceof Error ? error.message : String(error)))
    return () => {
      live = false
    }
  }, [active])

  // Registering is an idempotent upsert, so a team created while the API was down is registered on the next load.
  useEffect(() => {
    if (!active) return
    let live = true
    setRegisterError(null)
    api
      .upsertTeam(active.address, active.label, active.kind)
      .catch((e: unknown) => live && setRegisterError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [active])

  const create = useCallback(async (kind: SignerKind, label: string) => {
    const stored = await createSigner(kind, label)
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
    () => ({ signers, active, client, loadError, registerError, create, select, forget }),
    [signers, active, client, loadError, registerError, create, select, forget],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
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
