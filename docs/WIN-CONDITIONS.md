# WIN-CONDITIONS: Leash, Crypto World's Fair Tempo track

Written 2026-09-18 from 20+ real transactions on Tempo's Moderato testnet plus mainnet log
reads. Every number is measured, not quoted from documentation. Revised 2026-09-18 by the
build session to reconcile three figures against `INDEXER.md §5` and `BUILD-SPEC §6`, which
are the authoritative records of the same measurements.

Contest: Crypto World's Fair, 2026-09-14 to 2026-10-12 23:59 PT. Winners 2026-12-05.
Track: $100,000 across 10 products that integrate with the Tempo blockchain.

## Answers

Scoreboard: no public Tempo leaderboard exists, so the scoreboard is the chain itself; over a 50,000-block mainnet window (blocks 40,067,463 to 40,117,463, 7.72 hours) there were 1,563 `AccessKeySpend` events across 476 distinct accounts and 478 distinct keys, 11 `KeyAuthorized`, 1 `KeyRevoked`, and exactly 0 `SpendingLimitUpdated` and 0 `AdminKeyAuthorized`; the nearest commercial comparable is Mercantill, which sells spending safeguards and audit trails for AI agents without protocol enforcement
Bar to beat: 476 accounts a day already spend through protocol-enforced budgets with zero tooling above them; the bar is being the first product any of those 476 operators would actually install, measured as a policy they sign and a revoke they use
Asset we will own: the policy compiler that turns a human sentence into a correctly-encoded `KeyRestrictions` tuple, plus the blast-radius index that maps MPP payout addresses to the full set of services each one can pay; obtained by transacting on Moderato and by enumerating the live MPP catalog, not by reading docs
Off-platform buyer: the platform-engineering or finance owner at any company already running agents against the live `*.mpp.tempo.xyz` gateways (openai, anthropic, fal, firecrawl, modal, openrouter, oxylabs, serpapi endpoints are payable today), who has to answer "what can this agent spend, and how do I stop it at 2am"
Single entry: Leash, one product in this track
Verb the brief names: "integrate with the Tempo blockchain" (rules §14(f)); the sponsor's own public brief adds "bonus points from me personally if you are at the forefront of integrating @mpp" (Tempo GTM @AtownBrown, 2026-09-07, quote-tweeted by Matt Huang)
Our product performs that verb: yes. Writes `authorizeKey` (selector 0x980a6025), `updateSpendingLimit`, `setAllowedCalls`, `removeAllowedCalls`, `revokeKey` against the AccountKeychain precompile at `0xaAAAaaAA00000000000000000000000000000000`; agent payments ride `transferWithMemo` (0x95777d59) under a protocol-enforced budget as tx type 0x76. Proven on Moderato: an allowed sponsored transfer succeeded at 76,738 gas and an allowed unsponsored warm transfer at 52,078; exceeding the cap reverted `SpendingLimitExceeded`; paying outside the allowlist reverted `CallNotAllowed`; calling plain `transfer()` to the allowed merchant also reverted `CallNotAllowed`; paying in an unscoped token reverted `CallNotAllowed`; root-key controls passed on every case, so the guard is not vacuously rejecting; `revokeKey` lands in 28,192 gas and 2.8 seconds
Metric plan: policies signed and revocations executed, target 1 signed policy and 1 live revoke on day one of the demo and 10 distinct agent keys under management by 2026-10-05, checked against `KeyAuthorized` and `KeyRevoked` logs from the indexer; the ecosystem metric is `SpendingLimitUpdated`, which stands at 0 on mainnet today and which this product exists to move off zero
Live by: 2026-10-05
Deviation from research: yes, three. Fee sponsorship was recorded as UNVERIFIED and possibly non-composing with access keys; it composes on two independent paths and additionally removes the gas-debits-budget problem, so the design now sponsors by default. Mainnet usage was recorded as 659-1,088 events across ~150 accounts; the real figures are 1,563 across 476. The hosted mainnet indexer was assumed open; it returns 402 and only the testnet indexer at `indexer.testnet.tempo.xyz` is free

## What changed the product after verification

**Fee sponsorship composes.** Three paths measured on a 3.000000 payment: unsponsored debits
3,003,597 from the budget and emits two `AccessKeySpend` events; a self-hosted fee payer debits
exactly 3,000,000 and emits one; Tempo's public relay at `sponsor.moderato.tempo.xyz` does the
same. The earlier negative was a `cast` tooling gap. Sponsorship is not a bypass: all four
negative controls still revert when re-run sponsored.

**Blast radius is the feature.** Sixteen MPP services, including openai, anthropic, fal,
firecrawl, modal and openrouter, share one payout address
`0xca4e835F803cB0b7C428222B3A3B98518d4779Fe`. Scoping a key to "OpenAI" silently authorises
fifteen more services. A weaker version of the same collision puts apex-db, rxatlas,
trialbase-db and recallradar behind `0x1Ee42717b1c370dACE197a8850Bf41a932F3b5A8`. No existing
tool shows an operator this before they sign.

**Not everything is governable, and the product must say so.** MPP `session`-intent services
call `tip20ChannelReserve.open` (0xedc53b00) at `0x4d50500000000000000000000000000000000000`
rather than `transferWithMemo`, so a token-scoped key cannot pay them at all and recipient
allowlists have no effect on that path. A policy UI that implied coverage there would be lying
to the operator.

**Telemetry must be reconciled, not read.** Gas is pre-charged against the budget at the gas
limit and partially refunded after the events fire, so the last `AccessKeySpend` event's
`remainingLimit` is stale by the refund (measured gap: 206 units on tx `0x9428efd9…`). Every
displayed balance comes from `getRemainingLimitWithPeriod`, never from the event stream, and
`getRemainingLimit` without the period suffix reverts `0xaa4bc69a` on period-based limits.

## Known open items, stated before building

- The negative controls have been run through the public relay on the success path only.
- Whether a mainnet sponsor endpoint is reachable without an invite-only Tempo console key is
  unconfirmed. Three fallback designs are specified in `CRITICAL-PATH.md §7`. The demo is built
  to work on testnet regardless.
- The mainnet census is one 7.72-hour window on one day; a single window cannot distinguish a
  trend from a spike.
- The blast-radius index is a point-in-time capture of live 402 challenges. It carries its own
  `capturedAt` and the product re-resolves every recipient before it signs an `authorizeKey`,
  because a cached payout address across an allowlist rotation is exactly the failure this
  product exists to prevent.
