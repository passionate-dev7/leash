# Positioning: LEASH vs vet402, Fermata, Cursus (and Setra402, Rolepay)

Sources: each rival's Colosseum Arena page (fetched 11 Oct 2026), the CWF team ARENA-COMPETITORS notes and docs/COMPETITORS.md. Quotes are from the rivals' own materials. We have not run any rival's product.

## The three real rivals

| | LEASH | vet402 | Fermata | Cursus |
|---|---|---|---|---|
| What their materials say | Agent never pays more than the listed price; one signature cuts a vendor that took payment and failed | "pays first, with its own wallet, and publishes what came back next to the payment tx" | "the payment is held in escrow on Tempo. TLSNotary records exactly what the vendor's server answered"; failure or timeout "refunds the agent automatically" | "delegate work with limits on authority and budget, and require evidence plus human sign-off before results count" |
| When it acts | Before the agent signs (price), and after a failure (cut, enforced by the chain on the next charge) | Before your agent buys, using vet402's own past purchases | Around each payment (escrow until proof) | Around each delegated task (roles, budgets, sign-off) |
| Chain / rails | Tempo MPP; Tempo access keys enforce limit and recipient scope | x402 and MPP; "It also buys on Tempo and Base"; 141 Solana sellers tested Sept 28-29 | MPP or x402, escrow on Tempo; "Live on Tempo testnet" | Any runtime; first x402 payment on Solana devnet; optional onchain commitments planned |
| Links | leash-eiy.pages.dev | github.com/kzmttkc/vet402-delivery, x.com/vet_402 | github.com/bilgin-kocak/fermata | cursus.build |

**vet402.** A buyer-side reputation service: it spends its own money so others know which sellers deliver. It is also our evidence source: its report in tempoxyz/mpp#1034 (42 of 89 paid Tempo calls answered 400/422) is the failure pattern LEASH Delivery Cut replays, and LEASH imports and re-verifies its public Tempo ledger. vet402 tells you a seller is bad; LEASH enforces your decision on your own agent's key, and refuses overpriced quotes that a delivery grade would not catch (stablestudio's $10.00 ask for a $0.039 listing). Complementary more than competing.

**Fermata.** The closest on Tempo. Fermata changes how the vendor gets paid: escrow, a TLSNotary delivery proof, then release or refund, which needs vendor-side or escrow integration per call. LEASH changes nothing for the vendor: it works with the standard MPP 402 flow and an existing Tempo access key, refuses a bad price before any money moves, and cuts a repeat offender with one signature. Fermata recovers money after a failed call; LEASH prevents the overpay and stops the next charge.

**Cursus.** An organizational accountability layer (roles, delegation, human sign-off, audit records) across agent runtimes. Its budget limits are at the task and role level. LEASH is narrower and lower: per-payment price checks and chain-enforced spend and recipient limits on the agent's Tempo key.

## Secondary

- **Setra402**: "Trust layer for agent payments"; chain unknown, possibly Solana/x402; 18 likes on its post (x.com/510Sulove/status/2102234121171079449). Not verified.
- **Rolepay**: Discord communities pay human contributors on Tempo. Different buyer.

## Limits we state openly
Chain proof is on a local anvil fork of Tempo mainnet (hashes are local, revert reasons inferred). Route does not verify that sellers return equivalent output. The fal post-payment 422 comes from vet402's mpp#1034 report, not our own paid call. A cut on a shared payout address also cuts sibling endpoints.
