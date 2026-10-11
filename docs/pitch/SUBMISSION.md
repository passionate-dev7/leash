# LEASH: submission package (Tempo track, Colosseum Crypto World's Fair)

**Name:** Leash
**One-liner:** Your agent never pays more than the price on the menu, and one signature cuts off a vendor that took the money and failed to deliver.
**Live:** https://leash-eiy.pages.dev (#/quote-cap, #/delivery-cut). API: https://leash-api.fly.dev
**Demo video:** `docs/pitch/demo.mp4` (1440x900, recorded against live deploy 1bb36eed; kept out of git, upload separately)
**Repo:** `tempo/projects/leash` (pnpm monorepo)

## Problem
On MPP the vendor names its price in the 402 challenge, and a default mppx client signs whatever it names (mppx 0.12 and 0.13.4 have no max-amount check). The charge also settles before the service checks the request, so a vendor can take the money and then fail.

## Evidence
- tempoxyz/mpp-specs#359: $450 charged against $100 authorized. https://github.com/tempoxyz/mpp-specs/issues/359
- Live capture, Tempo mainnet, 2026-10-10: stablestudio lists `POST /api/generate/nano-banana/generate` at $0.039 in the mpp.dev catalog; its 402 asked $10.00 with no prompt and $0.07 with one. 13 of 273 parsed mainnet challenges did not match their listing.
- tempoxyz/mpp#1034: vet402 paid 89 directory calls on Tempo; 42 settled and then answered 400 or 422. https://github.com/tempoxyz/mpp/issues/1034
- tempoxyz/mpp#840 (ROZO delisted 5 merchants); X: @casaisdev, @prasanth_kuna, @jrcrypto_dev.
- Shared payout address: unpaid 402 probe of mpp.tempo.xyz gateways, 2026-10-03, `apps/web/public/evidence/probe-all402-2026-10-03.json` (not yet committed).

## What is built
- **Quote-Cap guard** (`packages/policy/src/quote-cap.ts`, wired into `createLeashFetch` in `packages/sdk`): refuses a quote above listing + allowance, above a per-call cap, in the wrong currency, or for an unlisted endpoint, inside mppx `onChallenge`, so nothing is signed.
- **Route** (`packages/policy/src/route.ts`): the cheapest listing of the same upstream API across MPP sellers; the guard then holds that seller to its own price. Output equivalence across sellers is not verified with paid calls.
- **Delivery Cut** (`judgeDelivery`, `decideCuts`, `planDeliveryCuts`): a paid-then-failed vendor's payout address is removed from the agent's Tempo access key with one signature; its next charge reverts.
- **Chain lock**: the agent key is scoped to vendor payouts with a daily limit, so a bypassed guard still cannot overspend.
- Spend desk built before the Fair (Sep 2026): per-agent access keys, delivery ledger, vendor cut-off, API, console.

## 60-second judge path
1. Open https://leash-eiy.pages.dev/#/quote-cap. **No prompt** is selected: listed $0.039, the 402 asks $10.00.
2. Press **Let the agent pay this quote**: *Refused before signing*.
3. Pick **With prompt** ($0.07). Refused at **Exact**; set *Allowed above the listing* to **2x** and press again: *Paid $0.07*.
4. Scroll: Route groups, then the same quotes on a Tempo mainnet fork (paid, refused, bypass reverted, other vendor reverted).
5. Open https://leash-eiy.pages.dev/#/delivery-cut: fal asked $0.003, was paid, answered 422. Press **Sign the cut**: fal's next charge reverts on the fork, stablestudio is still paid.

## Business model (planned; no customers or revenue yet)
The guard and SDK stay open source, so any MPP client can refuse an overpriced quote. Teams that run paying agents would pay a monthly fee per active agent key for the hosted spend desk: price book updates, delivery tracking and one-signature cuts. Route could later take a small share of the saving it finds on each call.

## Positioning
- **vet402** grades sellers by buying from them with its own wallet; it does not control an agent's key. Leash refuses a wrong price before signing and cuts a failing vendor on chain. vet402's grades could feed a Leash cut.
- **Fermata** escrows each MPP call on Tempo testnet and refunds on a TLSNotary-proven failure, through its gateway. Leash does not refund; it needs no gateway, checks the quoted price against the listing (not described in Fermata's README) and stops all later charges with one signature.
- **Cursus** records who acted under whose authority, with role budgets and human sign-off; its first payment was x402 on Solana devnet. Leash limits payments only, enforced by Tempo access-key rules and a per-quote check.
- Setra402 ("trust layer for agent payments") has no public mechanism we could compare.

## Honest limitations
- No mainnet spend: the on-chain proof runs on a local anvil fork of Tempo mainnet. Hashes exist only there and revert reasons are inferred. Tenderly does not support Tempo.
- fal's post-payment failure is from vet402's public report, not a payment we made.
- A cut removes a payout address: fal's is shared with openai, firecrawl and nine other gateways per the 3 Oct probe, so the cut stops those too. The fork run only charged fal and stablestudio.
- Route compares listed prices; it does not verify that sellers return equivalent output.
- No refunds: Leash limits loss to the failed call, it does not recover it.
- Price book is a snapshot of the mpp.dev catalog (10 Oct 2026).

## Run it
Node 22+, pnpm 11. No mainnet spend.
```bash
pnpm install
pnpm test                                # policy, 80 pass
pnpm --filter @leash/sdk test            # payment path with real stablestudio 402s replayed, 10 pass
./scripts/fork/run-fork-demo.sh          # Quote-Cap on an anvil fork of Tempo mainnet, ~25 s
./scripts/fork/run-delivery-cut.sh       # Delivery Cut on the fork, ~20 s
pnpm --filter @leash/web dev             # UI at http://localhost:5173/#/quote-cap
```
Checked from a clean clone on 11 Oct 2026: `docs/pitch/outside-user-dry-run.md`.

## Portal paste fields

**Project name:** Leash

**One-liner:** Your agent never pays more than the price on the menu, and one signature cuts off a vendor that took the money and failed to deliver.

**Description (short):** AI agents pay for APIs over MPP on Tempo, and the default client signs whatever price the vendor's 402 names. On 10 Oct 2026 stablestudio listed an image call at $0.039 and asked $10.00. Leash checks every quote against the listed price before the agent key signs, routes each call to the cheapest listed seller, and lets one team signature cut a vendor that was paid but did not deliver, so the chain refuses its next charge. Proven on an anvil fork of Tempo mainnet with no mainnet spend.

**Chains and tools:** Tempo (mainnet chain 4217 via an anvil fork; Moderato testnet 42431 for the spend desk); MPP with mppx 0.12; Tempo AccountKeychain access keys, TIP-1022 virtual addresses, 0x76 batched transactions; viem 2.57; foundry/anvil 1.8.5; TypeScript, pnpm, vitest; React + Vite on Cloudflare Pages; API on Fly.io.

**Go to market:** Start with teams already paying MPP APIs from agents, reached through the public MPP issues where they report overcharges and failed deliveries (mpp-specs#359, mpp#1034, mpp#840). The guard and SDK are open source as a drop-in wrapper for mppx clients; teams pay a monthly fee per active agent key for the hosted spend desk (price book updates, delivery tracking, one-signature cuts). Planned; no customers or revenue yet.

**Prior work disclosure:** Leash started on 19 Sep 2026 (first commit c36d71f); 53 commits predate 10 Oct. Built before the World's Fair: the spend desk (per-agent Tempo access keys with chain-enforced limits and scopes, delivery ledger, vendor cut-off on Moderato, API, console). Built during the World's Fair (10 to 13 Oct 2026): the Quote-Cap guard in the mppx payment path, the mpp.dev price book, Route in the payment path, Delivery Cut on an outside vendor (fal), the anvil fork proofs on Tempo mainnet, and the new UI.

**Links:** live https://leash-eiy.pages.dev , API https://leash-api.fly.dev , repo: (add public URL)
