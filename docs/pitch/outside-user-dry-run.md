# Outside-user dry run (11 Oct 2026, 10:10 IST)

Goal: follow the README as a stranger on a clean checkout. Mac (macOS, node v24.9.0, pnpm 11.22.0). No mainnet spend, no live Moderato tests.

| # | Step (as README says) | Command | Result |
|---|---|---|---|
| 1 | Clean checkout | `git clone <repo> ~/leash-dryrun` (from local repo at 754b632+) | OK |
| 2 | Install | `pnpm install` | OK, 9.3 s |
| 3 | Typecheck | `pnpm typecheck` | **FAIL**: `packages/policy/test/unit/delivery-cut.test.ts(39,57): TS2322 Type 'number' is not assignable to type 'string \| bigint'` |
| 4 | Policy tests | `pnpm test` | 80/80 pass |
| 5 | SDK tests (real stablestudio 402s replayed, fetch stubbed) | `pnpm --filter @leash/sdk test` | 6/6 pass |
| 6 | API tests | `pnpm --filter @leash/api test` | 55/55 pass |
| 7 | Web tests, vendors tests | `pnpm --filter @leash/web test`, `--filter @leash/vendors test` | 0 failures each |
| 8 | Web build | `pnpm --filter @leash/web build` | OK (chunk-size warning only) |
| 9 | Wrap a fetch with quoteCap, replay the $10.00 quote locally | `cd packages/sdk && npx tsx scratch/stranger.ts` (script: `docs/pitch/dryrun/stranger.ts`) | `refused: QuoteCapExceeded`, listed 39000, quoted 10000000, ceiling 78000 (2x tolerance), **0 signed retries** |
| 10 | Quote-Cap fork demo | `./scripts/fork/run-fork-demo.sh` | OK, 23.6 s, installed foundry itself. 0.07 and 0.039 paid; 10.00 `not_sent` (guard); bypass 10.00 `reverted_onchain`; other vendor `reverted_onchain`; errors `unknown` (anvil gives no selector) |
| 11 | Delivery Cut fork demo | `./scripts/fork/run-delivery-cut.sh` | OK, 20.8 s. `fal_next_charge reverted_onchain`, `ss_after_cut success` |
| 12 | Root script from package.json | `pnpm console` | **FAIL**: "No projects matched the filters" (no `@leash/console` package; same for `demo`, `demo:headless`, `server`) |

## Friction a stranger hits
- The README SDK snippet uses `network` and `agent` without saying where they come from. A runnable version needs `NETWORKS.mainnet` and an account with `accessKeyAddress` (see stranger.ts).
- The snippet only shows the refusal; to replay locally without spend you must stub `fetch` yourself. The SDK unit test is the only example.
- Running the fork demos rewrites committed files under `scripts/fork/out/` (git shows them modified).
- `mitm_mcp_traffic.db` (empty SQLite, table `flows`) is committed at the repo root; looks accidental.
- `pnpm test` at root runs only the policy suite, not all suites.
- `pnpm test:adversarial` needs live Moderato; not run here.
