# LEASH: pitch script (Colosseum brief, max 2 minutes)

Brief: "tell us what you're building, and tell us why you're the people to build it. Nothing fancy required. We're interested in how you think and communicate."

---

Hi, I'm Kamal, and I'm building Leash.

AI agents now pay for APIs on their own. On Tempo, they use MPP: the seller replies with a price, and the agent's wallet pays it. The standard client pays whatever price the seller names. Nobody checks it.

So I checked. On October 10, stablestudio listed an image call at 3.9 cents. I sent a request without a prompt, and it asked for ten dollars. That's 256 times the listed price. I saved the request and paid nothing. Overcharging isn't the only problem. Another team, vet402, reported that 42 of its 89 paid calls on Tempo took the money and then failed.

Leash is a spend guard for these agents. It does three things. First, before the agent signs anything, it compares the asking price with the listed price, and refuses anything above your limit. Second, when several sellers offer the same API, it sends the call to the cheapest one. Third, when a vendor takes the money and doesn't deliver, one signature removes that vendor from the agent's key. The chain refuses its next charge, and the good vendors keep getting paid.

Why us? Because every claim here comes with proof you can check. That ten dollar quote is a real capture from Tempo mainnet, and we paid nothing. On a copy of Tempo mainnet, Leash refused that quote before signing, and when we forced the payment anyway, the chain reverted it. And we keep a written audit of what is proven and what is only partly proven, like the exact reason the chain gives for a refusal.

That's how we'll keep building it: real data first, honest about the gaps.

Try it at leash-eiy.pages.dev. Thanks.

---

## Sources for the "why us" lines (not spoken)
- Ten dollar quote, captured unpaid on Tempo mainnet, 10 Oct 2026, $10.00 asked vs $0.039 listed (256x): README "Why"; captured 402s in `scripts/fork/quotes.json`; SDK replay test `packages/sdk/test/unit/quote-cap-guard.test.ts` (AUDIT.md row 5).
- Refused before signing on the fork, bypass reverted by the chain: `scripts/fork/run-fork-demo.sh`, `scripts/fork/FORK.md`, AUDIT.md row 12 and Final status ("Fork demo: Quote-Cap / Delivery Cut: working (re-run 11 Oct)"); live page `#/quote-cap` "Fork run 1": 1 refused by Leash, 2 reverted by the chain.
- Written audit, proven vs partial: `docs/AUDIT.md` (per-vendor key limit marked "partial: reverts on the fork decode as unknown").
- 42 of 89 (spoken earlier): https://github.com/tempoxyz/mpp/issues/1034 (vet402).
