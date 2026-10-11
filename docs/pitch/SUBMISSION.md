# LEASH: submission package (Tempo track, Colosseum Crypto World's Fair)

**Name:** Leash
**One-liner:** Your agent never pays more than the price on the menu, and one signature cuts off a vendor that took the money and failed to deliver.
**Live:** https://leash-eiy.pages.dev (#/quote-cap, #/delivery-cut). API: https://leash-api.fly.dev
**Demo video:** `docs/pitch/demo.mp4` (1440x900, about 3 min, recorded against the live site)
**Repo:** `tempo/projects/leash` (pnpm monorepo)

## Problem
On MPP the vendor names its price in the 402 challenge, and a default mppx client signs whatever it names (mppx 0.12 and 0.13.4 have no max-amount check). The charge also settles before the service checks the request, so a vendor can take the money and then fail.

## Evidence
- tempoxyz/mpp-specs#359: $450 charged against $100 authorized. https://github.com/tempoxyz/mpp-specs/issues/359
- Live capture, Tempo mainnet, 2026-10-10: stablestudio lists `POST /api/generate/nano-banana/generate` at $0.039 in the mpp.dev catalog; its 402 asked $10.00 with no prompt and $0.07 with one. 13 of 273 parsed mainnet challenges did not match their listing.
- tempoxyz/mpp#1034: vet402 paid 89 directory calls on Tempo; 42 settled and then answered 400 or 422. https://github.com/tempoxyz/mpp/issues/1034
- tempoxyz/mpp#840 (ROZO delisted 5 merchants); X: @casaisdev, @prasanth_kuna, @jrcrypto_dev.
- Shared payout address: unpaid 402 probe of mpp.tempo.xyz gateways, 2026-10-03, `apps/web/public/evidence/probe-all402-2026-10-03.json`.

## What is built
- **Quote-Cap guard** (`packages/policy/src/quote-cap.ts`, wired into `createLeashFetch` in `packages/sdk`): refuses a quote above listing + allowance, above a per-call cap, in the wrong currency, or for an unlisted endpoint, inside mppx `onChallenge`, so nothing is signed.
- **Route** (`packages/policy/src/route.ts`): the cheapest listing of the same upstream API across MPP sellers; the guard then holds that seller to its own price. Output equivalence across sellers is not verified with paid calls.
- **Delivery Cut** (`judgeDelivery`, `decideCuts`, `planDeliveryCuts`): a paid-then-failed vendor's payout address is removed from the agent's Tempo access key with one signature; its next charge reverts.
- **Chain lock**: the agent key is scoped to vendor payouts with a daily limit, so a bypassed guard still cannot overspend.
- Spend desk built before the Fair (Sep 2026): per-agent access keys, delivery ledger, vendor cut-off, API, console.

## 60-second judge path
JUDGE_PATH_PLACEHOLDER

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
RUN_PLACEHOLDER
