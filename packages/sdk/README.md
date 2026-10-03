# @leash/sdk

The agent side of Leash. An agent holds its own Tempo access key, pays MPP services with it, and reports every payment to the team's spend desk. The desk reads each settlement back from the team's chain (Moderato or Tempo mainnet) before it counts it.

## Wrap an agent's fetch

```ts
import { agentAccount, agentNetwork, createLeashFetch, fetchBlocked, reportTo } from '@leash/sdk'

const blocked = await fetchBlocked(DESK_API, TEAM)            // recipients the desk has cut
const leashFetch = createLeashFetch({
  network: agentNetwork('moderato'),                          // or 'mainnet': USDC.e for budget, payment and fees
  agent: agentAccount(AGENT_PRIVATE_KEY, TEAM),               // the key id the team authorized
  blocked: () => blocked,
  onRecord: reportTo(DESK_API, AGENT_PRIVATE_KEY),            // signed delivery record to the desk
})

const { response, record } = await leashFetch('https://vendor.example/v/atlas/scrape', { method: 'POST', body: JSON.stringify({ url }) })
```

`record.outcome` is `delivered`, `paid_not_delivered`, `refused`, `free` or `unsettled`. A charge settles before the vendor runs the request, so paid and delivered are separate facts, and the record joins the two through the memo inside the agent's own signed transaction.

`reportTo` signs each record with the agent key (EIP-191 personal_sign over the keccak256 of the record's canonical JSON) and posts it to `POST /api/agents/:keyId/records`. The desk accepts a record when the signature recovers to an active agent key and, for a payment, the settlement transaction shows the transferWithMemo to the recorded recipient with the recorded memo and an AccessKeySpend by that key for the recorded amount.

## The `leash-agent` CLI

```sh
leash-agent init                                    # writes .leash-agent.json (mode 600), prints the key id
# desk: Agents, "I run it", paste the key id, sign the authorization with the team key
leash-agent pay https://desk.example/v/atlas/scrape \
  --method POST --data '{"url":"https://example.com"}' \
  --team 0xTEAM
leash-agent pay https://vendor.example/v1/search --team 0xTEAM --network mainnet
```

`--network` is `moderato` (default, OUSD) or `mainnet` (Tempo 4217, USDC.e). `pay` reads the team's network from the desk and refuses a different `--network` before anything is signed. It fetches the desk's blocked recipients, pays the request, prints the response and the delivery record, and posts the signed record to the desk. From this repository: `pnpm --filter @leash/sdk leash-agent init`.

## Exports

`createLeashFetch`, `planCutoff`, `reportTo`, `postRecord`, `signRecord`, `recordDigest`, `canonicalJson`, `fetchBlocked`, `fetchTeamNetwork`, `agentAccount`, `agentNetwork`, `AGENT_NETWORK`, plus the chain reads in `reads.ts`.
