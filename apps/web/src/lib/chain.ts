import { createClient, createPublicClient, http, publicActions, walletActions, erc20Abi } from 'viem'
import { Abis, Addresses } from 'viem/tempo'
import type { Address, Hash, Hex } from 'viem'
import type { Account } from 'viem'
import { NETWORKS } from './config'
import type { NetworkName } from './config'
import type { Scope } from './verifyCalls'

const publicClients = new Map<NetworkName, ReturnType<typeof makePublicClient>>()
const makePublicClient = (network: NetworkName) => createPublicClient({ chain: NETWORKS[network].chain, transport: http(NETWORKS[network].rpcUrl) })
export function publicClient(network: NetworkName) {
  let client = publicClients.get(network)
  if (!client) {
    client = makePublicClient(network)
    publicClients.set(network, client)
  }
  return client
}

/** The team key's client on its network. Gas is paid in the network's fee token: PathUSD on Moderato, USDC.e on mainnet. */
export function rootClient(account: Account, network: NetworkName) {
  const n = NETWORKS[network]
  return createClient({
    account,
    chain: n.chain.extend({ feeToken: n.feeToken }),
    transport: http(n.rpcUrl),
  })
    .extend(publicActions)
    .extend(walletActions)
}
export type RootClient = ReturnType<typeof rootClient>

/** The team's budget token balance and, where gas is paid in another token, that balance too. */
export async function balances(network: NetworkName, address: Address): Promise<{ budget: bigint; fee: bigint | null; block: bigint }> {
  const n = NETWORKS[network]
  const client = publicClient(network)
  const read = (token: Address) => client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
  const [budget, fee, block] = await Promise.all([read(n.token), n.feeToken === n.token ? Promise.resolve(null) : read(n.feeToken), client.getBlockNumber()])
  return { budget, fee, block }
}

/** Receipt wait that survives a flaky public RPC: polls, tolerates transient errors, fails on a revert or timeout. */
export async function waitForSuccess(hash: Hash, network: NetworkName, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const receipt = await publicClient(network).getTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted on chain`)
      return
    } catch (error) {
      if (error instanceof Error && error.message.includes('reverted on chain')) throw error
      lastError = error
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Transaction ${hash} not confirmed within ${Math.round(timeoutMs / 1000)}s${lastError instanceof Error ? ` (${lastError.message})` : ''}`)
}

export type Call = { to: Address; data: Hex }

/** The scopes each key holds on chain right now, read by this browser from the network's own RPC, not through the API. */
export async function readScopes(network: NetworkName, account: Address, keyIds: readonly Address[]): Promise<Record<string, Scope[]>> {
  const client = publicClient(network)
  const out: Record<string, Scope[]> = {}
  await Promise.all(
    keyIds.map(async (keyId) => {
      const [, scopes] = await client.readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain, functionName: 'getAllowedCalls', args: [account, keyId] })
      out[keyId.toLowerCase()] = scopes as unknown as Scope[]
    }),
  )
  return out
}
