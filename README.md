# Leash

The spend desk for teams whose AI agents pay for APIs over MPP on Tempo.

Every agent gets its own Tempo access key. The chain enforces its daily OUSD budget and the list of
services it may pay. Every paid call is joined to its on-chain settlement and to what the vendor actually
returned, so the team sees, per agent and per vendor, what was paid and what was delivered. When a vendor
keeps taking money and failing, one signature removes it from every agent's key, and the chain refuses the
next payment to it while healthy vendors keep getting paid.

Live: https://leash-spend.vercel.app (Moderato testnet, chain 42431)

## The problem, in the buyers' own numbers

A charge settles before the vendor runs the request. "Paid" and "delivered" are separate facts.

- vet402, an independent buyer of paid endpoints, measured 42 of 89 paid Tempo calls settling and then
  answering 400 or 422 (tempoxyz/mpp#1034). Its daily cap lives in its own code.
- The ROZO MPP Router delisted five merchants to stop customers paying and then receiving a 502
  (tempoxyz/mpp#840).
- vet402's public Tempo ledger, re-verified row by row against mainnet by Leash: 72 of 72 settled rows
  check out, and 26 of them were paid without delivery.
- On mainnet, 658 of the 684 access keys that spent in one day (96.2%) can call anything, and one is bound
  to recipients (block 42,297,968).

## How it works

```
team key (browser: passkey or non-extractable WebCrypto P-256)
   │  authorizeKey: daily OUSD limit + transferWithMemo recipient scopes, one per service
   ▼
agent key ──pays──▶ MPP vendor (402 challenge, mppx 0.12, type 0x76 tx)
   │                     │
   │                     └─ HTTP outcome (200, 422, 502 ...)
   ▼
delivery ledger: settlement found by the mppx attribution memo inside our own signed tx
   │             (works when the vendor returns an error and no receipt)
   ▼
vendor view: paid / delivered / paid-but-failed per service
   │
   └─ Cut: ONE 0x76 transaction, setAllowedCalls on every agent key without that recipient,
           signed by the team key, read back from chain → next payment refused: CallNotAllowed
```

Three Tempo primitives carry the product, and none of them exists on a generic EVM chain:

- **AccountKeychain access keys** (`0xaAAAaaAA00000000000000000000000000000000`): periodic spending limits and
  `(target, selector, recipients)` call scopes, enforced by the protocol during execution.
- **TIP-1022 virtual addresses**: a vendor gives each service its own address on one master wallet. Recipient
  scopes match the literal address, so one service is cut without cutting its siblings. On a shared payout
  (mainnet `0xca4e…79Fe` collects for 12 services) Leash shows, before you sign, everything the cut also takes.
- **Batched 0x76 envelopes**: one signature rewrites the scope of every key on the team.

## Measured on chain

| What | Evidence |
|---|---|
| Agent pays an MPP vendor with a scoped access key, settlement joined by memo | Moderato tx `0x58bab500131d3fde059b8c1bdd024f3df9e62e77a47b281fc6ba4495ffcc4b0e` |
| Paid-then-422 call joined to its settlement with no vendor receipt | `0x2a78d1963f9abb965950dc17efa4d3def495f8cd05b9d08910cfa738e103a04c` |
| One tx cuts a service from 3 agent keys | `0x89b2d292821001537fb26426190b069d933d76c06c72867b2a3de4c0b70e1390`, 178,468 gas |
| Same vendor's other service (sibling virtual address) still paid after the cut | `0x298877602d0018402960c55ad10c48808b5794f8ea54bcc4325ca5e4dd6c1e1f` |
| Next payment to the cut service | refused by the chain with `CallNotAllowed`, nothing moves |
| Escrow deposit above the key's cap (MPP session) | refused with `SpendingLimitExceeded` |

Explorer: https://explore.testnet.tempo.xyz

## What runs

| Package | What it does |
|---|---|
| `packages/policy` | compiles a policy into the exact `KeyRestrictions` tuple; `removeRecipient` for cut-offs (an empty recipient list means "any recipient", so a rule is dropped, never emptied); revert decoding |
| `packages/sdk` | `createLeashFetch`: pays MPP with an agent key and writes a delivery record per call; `planCutoff`: one envelope for a whole team; `loadVet402Feed`: imports an outside buyer's delivery records and verifies every row on mainnet |
| `apps/vendors` | two MPP vendors on Moderato with real upstreams: Atlas Data (Hacker News search, page scrape, ECB exchange rates, one virtual address per service) and Relay Compute (summaries and keywords on one shared payout) |
| `apps/api` | teams, agent keys, the research runner, the ledger, vendor roll-ups, cut-off plans with chain read-back, the mainnet MPP replay (read-only) |
| `apps/web` | the spend desk: Team, Agents, Vendors, Ledger, Mainnet. Static build, IBM Carbon design system |

The team key never leaves the browser. The API holds only agent keys, and every agent key is capped and
scoped by the team key on chain.

Delivery outcomes for agents that run outside Leash are reported by the agent's own key. The desk checks each
payment in a record against its settlement on chain (payer, recipient, amount, memo, and the key's own spend),
and the HTTP outcome, whether the vendor delivered, is the agent's report. Every failure rate is kept per team.

## Run it

```bash
pnpm install
pnpm typecheck
pnpm test                               # policy unit tests
pnpm --filter @leash/vendors test       # vendor routes
pnpm --filter @leash/api start          # API + vendors on http://127.0.0.1:4180
pnpm --filter @leash/web dev            # spend desk on http://localhost:5173
pnpm --filter @leash/api e2e            # full loop on Moderato: team, faucet, agents, paid calls,
                                        # one-tx cut, chain refusal; prints every tx hash
```

## Read-only mainnet views

- `GET /api/mainnet/mpp?blocks=20000`: MPP charges to catalogued payout addresses on chain 4217, grouped by
  payout and by the mppx server fingerprint in the memo, with the services behind each payout.
- `GET /api/outside/vet402`: vet402's delivery records, each verified against its mainnet transaction.

## License

MIT
