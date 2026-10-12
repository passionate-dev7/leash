# Leash

**Every quote is checked against the catalog price before signing, so your agent never pays more than the menu, and a vendor that took the money and failed to deliver is cut off from the agent key.**

Leash is spend control for AI agents that pay for APIs over MPP (Machine Payments Protocol) on Tempo.

- Live: https://leash-eiy.pages.dev (`#/quote-cap`, `#/delivery-cut`), API https://leash-api.fly.dev
- Track: Tempo, Colosseum World's Fair (Oct 2026)
- Feature status: `docs/AUDIT.md`. A clean-checkout run of this README: `docs/pitch/outside-user-dry-run.md`

## Why

An MPP vendor names its price in the 402 challenge, and a default mppx Tempo client signs whatever it names: mppx 0.13.4 ships a flat `maxAmount` on its EVM charge, and its Tempo charge exposes `expectedRecipients`, `expectedChainId` and an `onChallenge` hook; none of them compares a quote with the catalog price of the endpoint being called. Leash checks each quote against that listing, not against one flat per-payment ceiling, and `quoteCapOnChallenge(book, policy)` plugs the same check into a plain mppx client. The charge also settles before the vendor runs the request, so "paid" and "delivered" are separate facts.

- **Live overcharge, Tempo mainnet, 10 Oct 2026:** stablestudio lists `POST /api/generate/nano-banana/generate` at **$0.039** in the mpp.dev catalog. Its 402 asked **$10.00** when the prompt was missing, and $0.07 with a prompt. We captured the 402s and paid nothing. 13 of 273 parsed mainnet challenges did not match their listing.
- [tempoxyz/mpp-specs#359](https://github.com/tempoxyz/mpp-specs/issues/359): $450 charged against $100 authorized.
- [tempoxyz/mpp#1034](https://github.com/tempoxyz/mpp/issues/1034): vet402 paid 89 directory calls on Tempo. 42 settled and then answered 400 or 422.
- [tempoxyz/mpp#840](https://github.com/tempoxyz/mpp/issues/840): the ROZO MPP Router delisted five merchants after customers paid and got a 502.
- On X: [@casaisdev](https://x.com/casaisdev/status/2098126844255948839), [@prasanth_kuna](https://x.com/prasanth_kuna/status/2108615889423826986), [@jrcrypto_dev](https://x.com/jrcrypto_dev/status/2097698954573959189).

## Features (all marked working in docs/AUDIT.md unless noted)

- **Quote-Cap** (`packages/policy/src/quote-cap.ts`): refuses a quote above the listing plus your allowance, above a hard per-call cap, in the wrong currency, or for an unlisted endpoint (capped or refused, your choice).
- **Guard in the payment path** (`createLeashFetch` in `packages/sdk/src/mpp.ts`): the check runs in mppx `onChallenge`, so a refused quote never produces a credential or a signature. The record carries `refused: "QuoteCapExceeded"` with listed, quoted and ceiling amounts.
- **Price book** (`packages/policy/data/price-book.4217.json`): a snapshot of the mpp.dev catalog for Tempo mainnet, dated 10 Oct 2026.
- **Route** (`packages/policy/src/route.ts`, `createLeashFetch({ route: true })`): ranks sellers of the same upstream API by listed price (Hunter email verifier $0.008 vs $0.03, Apollo people search $0.005 vs $0.02, Firecrawl scrape $0.002 vs $0.0126), sends the call to the cheapest one, records `routed`, and holds that seller to its own listing. Output equivalence across sellers is **not** verified.
- **Delivery Cut** (`judgeDelivery`, `decideCuts` in policy; `planDeliveryCuts` in the SDK): a vendor that took payment and failed is removed from the agent's Tempo access key in one transaction signed by the team key. Its next charge reverts; other vendors keep getting paid.
- **Chain lock behind the guard:** the agent key is scoped to vendor payout addresses with a periodic spend limit, so a bypassed guard still cannot overspend. Reverts are observed on the fork; the reasons there are inferred (*partial* in the audit). On Moderato the e2e decodes `CallNotAllowed` after a cut.
- **Spend desk** (built before the Fair): per-agent access keys, delivery ledger, vendor roll-ups, one-transaction cuts, a read-only mainnet MPP view and vet402's outside ledger at `/api/outside/vet402`.

## 60-second judge path

1. Open https://leash-eiy.pages.dev/#/quote-cap. The quote **No prompt** is selected: listed $0.039, the 402 asks $10.00.
2. Press **Let the agent pay this quote**. Result: *Refused before signing*.
3. Pick **With prompt** ($0.07). At **Exact** it is refused; set *Allowed above the listing* to **2x** and press again: *Paid $0.07*.
4. Scroll down: Route groups, then the same quotes run on a Tempo mainnet fork (paid, refused, bypass reverted, other vendor reverted).
5. Open https://leash-eiy.pages.dev/#/delivery-cut. fal asked $0.003, was paid, answered HTTP 422. Press **Sign the cut**: fal is cut, its next charge reverts on the fork, stablestudio is still paid.

## Quickstart

Requires node 22 or newer and pnpm 11.

```bash
pnpm install
pnpm test                                  # policy: Quote-Cap, Route, Delivery Cut, compile (80)
pnpm --filter @leash/sdk test              # payment path: real stablestudio 402s replayed, nothing signed (10)
./scripts/fork/run-fork-demo.sh            # Quote-Cap on an anvil fork of Tempo mainnet (~25 s, installs foundry 1.8.5)
./scripts/fork/run-delivery-cut.sh         # Delivery Cut on the fork (~20 s)
pnpm --filter @leash/web dev               # UI on http://localhost:5173/#/quote-cap
```

Running the fork demos rewrites the files in `scripts/fork/out/`.

## SDK usage

```ts
import { createLeashFetch, NETWORKS } from '@leash/sdk'
import { loadPriceBook, DEFAULT_QUOTE_CAP } from '@leash/policy'

// agent: a viem Account for the agent's Tempo access key, plus its accessKeyAddress
const pay = createLeashFetch({
  network: NETWORKS.mainnet,
  agent,
  quoteCap: { book: loadPriceBook(), policy: { ...DEFAULT_QUOTE_CAP, toleranceBps: 10_000 } }, // allow up to 2x the listing
  route: true,                                                                                // cheapest listed seller
})
const { response, record } = await pay('https://stablestudio.dev/api/generate/nano-banana/generate', { method: 'POST', body: '{}' })
// record.refused === 'QuoteCapExceeded'
// record.quote = { listed: 39000n, quoted: 10000000n, ceiling: 78000n, reason: 'above_listing', ... }
```

`DEFAULT_QUOTE_CAP` is `{ toleranceBps: 0, maxPerCall: 1_000_000n /* $1.00 */, unlisted: 'cap' }`. To replay the $10.00 quote with no network and no spend, see `docs/pitch/dryrun/stranger.ts`, which stubs `fetch` with the captured 402 (result: refused, 0 signed retries).

## Architecture

```
team key (browser passkey or non-extractable WebCrypto P-256)
   |  AccountKeychain authorize: periodic USDC limit + transfer scopes, one per vendor payout
   v
agent key --createLeashFetch--> MPP vendor 402 (price, currency, recipient)
   |   onChallenge: Quote-Cap check against the price book -> refuse (nothing signed) or sign
   |   Route: swap to the cheapest listed seller first
   v
delivery record: settlement found on chain by the mppx memo + HTTP outcome (200, 422, 502 ...)
   v
Delivery Cut: judgeDelivery -> decideCuts -> planDeliveryCuts
   one 0x76 tx, setAllowedCalls without that payout, signed by the team key
   -> the chain refuses the vendor's next charge
```

Tempo primitives used: AccountKeychain access keys (protocol-enforced spend limits and call scopes), TIP-1022 virtual addresses (one address per service on a master wallet, so a single service can be cut), and batched 0x76 transactions (one signature rewrites every key on a team).

## Fork proof

No mainnet money is spent. `scripts/fork/FORK.md` has the details.

- `run-fork-demo.sh`: funds a throwaway root on an anvil `--network tempo` fork of Tempo mainnet, authorizes an agent key limited to $0.20 and scoped to stablestudio, then replays stablestudio's captured 402s. $0.07 and $0.039 are paid; $10.00 is refused by the guard; a forced $10.00 signature reverts on chain; a payment to another vendor reverts on chain.
- `run-delivery-cut.sh`: the agent pays fal $0.003 and stablestudio $0.039. fal's post-payment 422 is replayed from vet402's mpp#1034 report. The root signs one cut, fal's next charge reverts, and stablestudio is still paid.
- Outputs land in `scripts/fork/out/`. Publish them to the UI with `python3 scripts/fork/to-web.py` and `python3 scripts/fork/to-web-delivery.py`.

## Business model (planned; no customers or revenue yet)

The guard and SDK stay open source, so any MPP client can refuse an overpriced quote. Teams that run paying agents would pay a monthly fee per active agent key for the hosted spend desk: price book updates, delivery tracking and one-signature cuts. Route could later take a small share of the saving it finds on each call.

## Positioning

- **vet402** pays sellers with its own wallet and publishes what came back next to the payment ([Arena](https://colosseum.com/arena/projects/vet402)). It grades sellers; it does not control your agent's key. Its mpp#1034 report is part of our evidence, and its grades could feed a Leash cut.
- **Fermata** holds each MPP or x402 payment in escrow on Tempo and refunds when a TLSNotary record fails the delivery rule ([Arena](https://colosseum.com/arena/projects/fermata)). Leash does not refund. It needs nothing from the vendor, checks the quoted price against the listing before signing, and stops later charges with one signature.
- **Cursus** registers humans and agents into roles with limits on authority and budget, plus human sign-off ([Arena](https://colosseum.com/arena/projects/cursus)). Leash is narrower: per-payment checks and chain-enforced limits on the agent's Tempo key.
- Setra402 ("trust layer for agent payments") has no public mechanism we could compare.

## Limitations

- The on-chain proof runs on a local anvil fork of Tempo mainnet. Its hashes exist only there, and anvil does not surface revert selectors, so `SpendingLimitExceeded` and `CallNotAllowed` are inferred. Tenderly does not support Tempo.
- fal's post-payment failure comes from vet402's public report, not a payment we made.
- A cut removes a payout address. fal's address is shared with openai, firecrawl and nine other gateways (unpaid probe, 3 Oct 2026), so cutting fal stops those too.
- Route compares listed prices only. It does not verify that sellers return the same output.
- No refunds: Leash limits the loss to the failed call; it does not recover it.
- The price book is a 10 Oct 2026 snapshot, not refreshed live.
- `pnpm test:adversarial` (20 tests) runs against live Moderato with throwaway testnet accounts (`testnet/keys.json`); last run 12 Oct 2026: 20/20 pass.

## Repo layout

| Path | What it is |
|---|---|
| `packages/policy` | Quote-Cap, price book, Route, Delivery Cut decisions, policy compile to `KeyRestrictions`, revert decoding |
| `packages/sdk` | `createLeashFetch` (pays MPP with an agent key, guard + Route, delivery records), `planCutoff` and `planDeliveryCuts`, vet402 feed import |
| `apps/api` | teams, agent keys, ledger, vendor roll-ups, cut plans with chain read-back, read-only mainnet views (deployed at leash-api.fly.dev) |
| `apps/web` | the UI: Quote-Cap, Delivery Cut, team, agents, vendors, ledger, mainnet (Cloudflare Pages) |
| `apps/vendors` | two MPP test vendors on Moderato with real upstreams |
| `scripts/fork` | anvil fork demos, captured quotes, UI publishers |
| `docs/AUDIT.md`, `docs/pitch/` | feature audit; pitch, submission and dry run |

## Tests

| Command | Suite | Result (11 Oct 2026) |
|---|---|---|
| `pnpm test` | policy | 80 pass |
| `pnpm --filter @leash/sdk test` | SDK payment path, Route, Delivery Cut plan | 10 pass |
| `pnpm --filter @leash/api test` | API | 55 pass |
| `pnpm --filter @leash/web test` | web | pass |
| `pnpm --filter @leash/vendors test` | vendors | pass |
| `pnpm --filter @leash/api e2e` | full loop on Moderato (needs the API running) | E2E PASS |
| `pnpm test:adversarial` | 20 live Moderato tests | 20/20 pass (12 Oct 2026) |

## Built before vs during the World's Fair

- **Before** (19 Sep to 5 Oct 2026, 53 commits): the spend desk: per-agent access keys, delivery ledger, vendor cut-off, API, console.
- **During** (10 to 13 Oct 2026): Quote-Cap guard, price book, Route in the payment path, Delivery Cut on an outside vendor, fork proofs, the new UI.

## License

MIT
