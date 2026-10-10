# LEASH Quote-Cap fork demo (no mainnet spending)
Run: `./scripts/fork/run-fork-demo.sh` (first run calls `setup-foundry.sh`, installs foundry v1.8.5 into scripts/fork/.foundry-bin; ~30s total).
Env: PORT (default 8557), LIMIT (agent periodic limit, default 200000 = 0.20 USDC.e), FUNDER, LEASH_FORK_SOURCE_RPC, FOUNDRY_BIN.
What it does on an anvil `--network tempo` fork of Tempo mainnet (chain 4217, fees 0):
1. funds a fresh throwaway root with 20 USDC.e from a real holder impersonated on the fork only
2. per-vendor spending-limit tx: AccountKeychain authorize of a fresh agent key, limit LIMIT USDC.e, scope USDC.e.transfer@stablestudio (0x07F0...a045)
3. replays stablestudio's real recorded 402 quotes (quotes.json) through replay_quotes.py (cap = catalog 0.039 x 2): 0.07 and 0.039 PASS and are paid by the agent key; 10.00 REFUSED before signing; then a bypass attempt (agent key signs the 10.00 anyway) reverts on chain; and a payment to another vendor reverts on chain (scope)
Output for the UI: out/fork-run.json (fork_block, root, agent_key, balances before/after, remaining limit before/after, events[] {step,label,amount,tx,status,gasUsed,error}); out/events.jsonl; out/guard-decisions.txt.
Why foundry 1.8.5: anvil 1.6.0-nightly (Apr 2026) reads TIP-20 transferPolicyId as 0 on a mainnet fork, so every transfer reverts PolicyForbids.
Limits: tx hashes exist only on the local fork; no HTTP call to stablestudio is made (quotes are replayed from capture, no image is delivered); anvil's debug trace does not surface the revert selector, so reverted rows show error "unknown" (expected SpendingLimitExceeded for the 10.00 bypass, CallNotAllowed for the other vendor).

# LEASH Delivery Cut fork demo (LOCAL FORK ONLY, no mainnet spending)
Run: `./scripts/fork/run-delivery-cut.sh` (PORT default 8558), then `python3 scripts/fork/to-web-delivery.py` for the UI.
Real outside failure pattern (delivery/failure.json), no LEASH-run vendor: fal.mpp.tempo.xyz `POST /fal-ai/flux/schnell` with body `{}` answers a real 402 for 3000 (0.003 USDC.e) to 0xca4e835F803cB0b7C428222B3A3B98518d4779Fe (captured unpaid by LEASH, delivery/fal-402-headers.txt). tempoxyz/mpp#1034 (vet402) records fal settling such calls and then answering 422 `missing` at `body.prompt`; that 422 is replayed as the post-payment response (LEASH did not pay fal on mainnet).
Steps on the fork: fund fresh root; authorize agent key scoped to USDC.e.transfer @ {fal, stablestudio}; agent pays fal 0.003 (settles) and stablestudio 0.039 (settles); replayed outcomes go through @leash/policy decideCuts -> @leash/sdk planDeliveryCuts (delivery/judge.ts); the single planned AccountKeychain.setAllowedCalls tx (without fal) is signed once by the root; fal's next 0.003 charge reverts on chain; stablestudio is still paid.
Limits: tx hashes exist only on the fork; revert selector not surfaced by anvil (expected CallNotAllowed, inferred from same transfer succeeding before the cut); 0xca4e...79Fe also receives openai/firecrawl .mpp.tempo.xyz payments, so cutting it stops those too.
