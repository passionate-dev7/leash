import { createClient, createPublicClient, http, publicActions, walletActions, erc20Abi } from 'viem'
import type { Address, Hash, Hex } from 'viem'
import type { Account } from 'viem'
import { CHAIN, OUSD, PATHUSD, RPC_URL } from './config'

export const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) })

export function rootClient(account: Account) {
  return createClient({
    account,
    chain: CHAIN.extend({ feeToken: PATHUSD }),
    transport: http(RPC_URL),
  })
    .extend(publicActions)
    .extend(walletActions)
}
export type RootClient = ReturnType<typeof rootClient>

export async function balances(address: Address): Promise<{ ousd: bigint; pathusd: bigint; block: bigint }> {
  const [ousd, pathusd, block] = await Promise.all([
    publicClient.readContract({ address: OUSD, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    publicClient.readContract({ address: PATHUSD, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    publicClient.getBlockNumber(),
  ])
  return { ousd, pathusd, block }
}

/** Receipt wait that survives a flaky public RPC: polls, tolerates transient errors, fails on a revert or timeout. */
export async function waitForSuccess(hash: Hash, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash })
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
