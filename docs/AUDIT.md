# LEASH feature audit

Every feature or claim in the README and UI, exercised on 11 Oct 2026 (IST). Status: **working**, **partial**, **broken**, **claim-only**. Logs in `docs/audit/`. No mainnet money spent: chain proofs use a local anvil fork of Tempo mainnet or Moderato testnet.

| # | Feature / claim | Status (initial, 10:40 IST) | Evidence |
|---|---|---|---|
| 1 | Quote-Cap: refuse above listing + tolerance | working | `packages/policy` quote-cap tests (refuse $10 vs $0.039; $0.07 refused at 0, passes at 2x); SDK replay test: refusal before any signing RPC |
| 2 | Quote-Cap: hard cap per call | working | policy test "the per-call cap binds below the listing ceiling" |
| 3 | Quote-Cap: currency mismatch | working | policy test "refuses a quote in a different currency" |
| 4 | Quote-Cap: unlisted endpoints (cap or refuse) | working | policy test "unlisted endpoints: capped by maxPerCall, or refused outright" |
| 5 | Guard in the mppx payment path (onChallenge, nothing signed) | working | `packages/sdk/test/unit/quote-cap-guard.test.ts` (4): no Authorization retry, no signing RPC on refusal |
| 6 | Price book (mpp.dev catalog snapshot, chain 4217) | working | `packages/policy/data/price-book.4217.json`, `loadPriceBook()` used by tests and UI; snapshot dated 10 Oct 2026, not refreshed live |
| 7 | Route: cheapest seller ranking (UI + `allRoutes`) | working | policy tests "ranks sellers", UI #/quote-cap lists 3 groups with savings from the price book |
| 8 | Route: agent actually sent to the cheapest seller | **claim-only → fixed** | Before: SDK only recorded `cheaper`; UI said "Leash sends the agent to the cheapest listing". Fixed in `534c0b0`: `createLeashFetch({ route: true })` reroutes, records `routed`; 4 tests |
| 9 | Route: output equivalence across sellers | claim-only (disclosed) | not verified with paid calls; README says so |
| 10 | Delivery Cut: judgeDelivery / decideCuts | working | policy `delivery-cut.test.ts` |
| 11 | Delivery Cut: planDeliveryCuts (SDK keychain plan) | working | sdk `delivery-cut.test.ts` (2) |
| 12 | Fork demo: Quote-Cap (`run-fork-demo.sh`) | working | re-run 11 Oct: paid calls settle, $10 refused by guard, bypass and other-vendor charges `reverted_onchain` (`docs/audit/fork-demo.log`) |
| 13 | Fork demo: Delivery Cut (`run-delivery-cut.sh`) | working | re-run 11 Oct: pay_fal, pay_ss, cut success; fal_next_charge reverted; ss_after_cut success (`docs/audit/delivery-cut.log`) |
| 14 | Per-vendor key limit / scope on chain | partial | reverts observed on the fork, but the revert reason decodes as `unknown`; "SpendingLimitExceeded"/"CallNotAllowed" on the fork are inferred. On Moderato the e2e decodes `CallNotAllowed` after a cut |
| 15 | Spend desk full loop on Moderato (team, faucet, agents, paid calls, one-tx cut, chain refusal) | working | `pnpm --filter @leash/api e2e` → E2E PASS (`docs/audit/e2e.log`), needs the API running locally |
| 16 | Live API https://leash-api.fly.dev | working | /api/health 200 (Moderato), /api/featured, /api/stats, /api/outside/vet402, /api/mainnet/mpp, /api/mainnet/evidence all 200; /api/catalog?network=mainnet 400 `mainnet_disabled` by design |
| 17 | UI #/t (read-only featured team) | working | loads, no console errors, team ledger from API (`docs/audit/live-pages.jsonl`) |
| 18 | UI #/mainnet (read-only mainnet MPP view) | working | loads, no console errors |
| 19 | UI #/vendors, #/ledger, #/agents | working (needs a team) | show "No team account yet" until a team is created on #/team; same flows pass in the e2e |
| 20 | UI #/quote-cap interactive check | working | live; toggles + press; verdicts computed by the same `checkQuote` |
| 21 | UI #/delivery-cut | working | live; replays the fork proof JSON |
| 22 | README SDK snippet (createLeashFetch + quoteCap) | working | same call shape as the SDK replay test; `network`/`agent` must be supplied by the reader |
| 23 | Judge steps (No prompt refused; With prompt passes at 2x; Listed passes; Sign the cut) | working | matches `checkQuote` (70000 vs 39000 = 1.8x) and live UI |
| 24 | Shared payout address (fal = openai = firecrawl + 9) | partial | backed by the 3 Oct unpaid probe, but the site has no link or block; fixing in r9 |
| 25 | `pnpm test:adversarial` (20, live Moderato) | not re-run this pass | needs live Moderato agents; unit suites all green |

## Final status
(updated at the end of the round)
