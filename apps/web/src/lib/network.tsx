import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { NETWORKS } from './config'
import type { NetworkName } from './config'

const Ctx = createContext<NetworkName>('moderato')

/** The network of the team on screen: explorer links, token names and the chain the browser signs on follow it. */
export const NetworkProvider = ({ network, children }: { network: NetworkName; children: ReactNode }) => <Ctx.Provider value={network}>{children}</Ctx.Provider>

export const useNetwork = (): (typeof NETWORKS)[NetworkName] => NETWORKS[useContext(Ctx)]
