# LEASH

A spend-control plane for AI agent fleets on Tempo. Every agent gets its own access key,
scoped to the services it may pay, with a per-token budget the protocol enforces in consensus,
live telemetry, and a one-call kill switch.

The difference from everything else in this category: competing agent spend controls are
advisory application code. This one is a consensus rule in Tempo's `AccountKeychain`
precompile. A refused payment here is a node refusing, not a wrapper declining to call.

Everything in this repository was built against live chains. Nothing is mocked.

---

## What runs

| | command | what it does |
|---|---|---|
| operator console | `pnpm console` | fleet view: per-key budget, blast radius, spend history, revoke, resize, policy builder |
| console, no file watching | `pnpm server` | same thing, for a recording or a container |
| live demo | `pnpm demo` | browser page that streams a real 60-second run over SSE |
| live demo, terminal | `pnpm demo:headless` | the same run printed to stdout; add `--json` for one event per line |
| policy unit tests | `pnpm test` | 57 tests over the compiler, budget sizing, blast radius and revert decoding |
| adversarial suite | `pnpm test:adversarial` | 20 cases, every one a real transaction against Moderato. 19 pass; the 20th asserts the named pre-execution rejection the spec claimed and fails on purpose, see below |
| types | `pnpm typecheck` | all four workspace projects |

Console on `http://127.0.0.1:4174`, demo on `http://127.0.0.1:4175`. Both bind to loopback,
because the console signs with the fleet's root key.

### First run

```bash
pnpm install
node testnet/00-setup.mjs     # generates Moderato-only throwaway accounts and funds them
pnpm demo:headless
pnpm console
```

`testnet/00-setup.mjs` writes `testnet/keys.json`, which is chmod 600 and gitignored. No key
in this repository belongs to a person, and nothing here ever asks for one. Set
`LEASH_OPERATOR_ROLE` to choose which workspace label the console signs as; the default is
`OWNER`.

---

## What the demo does, in order

Each beat is a real transaction or a real HTTP request, and the page shows the transaction
hash, the gas, the wallclock, and the exact read that produced every number.

1. **Preflight.** Refuses to start against an unfunded account. A demo run against an empty
   balance would make every refusal below pass for the wrong reason.
2. **Ask MPP.** Hits `openai.mpp.tempo.xyz`, `firecrawl.mpp.tempo.xyz` and `api.exa.ai`
   unauthenticated, decodes the `WWW-Authenticate: Payment` challenges, and reads the price
   and payout address out of them. Live, at demo time, not from a cache.
3. **Blast radius.** Before anything is signed: the policy names two services, the allowlist
   holds one address, and that address is the payout for sixteen. Fourteen of them nobody
   asked for.
4. **Authorize.** One scoped, budgeted access key, installed through the `key_authorization`
   field of a type-`0x76` envelope. Budget is priced from the challenges in step 2.
5. **Spend.** Three payments to real MPP payout addresses. The budget is re-read from
   `getRemainingLimitWithPeriod` after each one and lands on exactly zero.
6. **Refuse.** Four attempts, four real chain responses: `SpendingLimitExceeded` for one unit
   past the cap, and `CallNotAllowed` three times, for an unlisted recipient, for plain
   `transfer()` instead of `transferWithMemo`, and for an unscoped token.
7. **Control.** The root key makes the exact call the agent was refused, and it succeeds.
   Without this the four refusals are equally consistent with a client that cannot transact.
8. **Kill switch.** `revokeKey`, then a payment attempt from the dead key, with a live clock.

A representative run, 2026-09-19 on Moderato, chain 42431:

```
authorizeKey            3,302,100 gas    2.9 s
pay openai                 76,750 gas    budget 12,250 -> 7,125
pay firecrawl              76,786 gas    budget  7,125 -> 5,125
pay openai                 76,750 gas    budget  5,125 ->     0
one unit over the cap      REFUSED  SpendingLimitExceeded     0.3 s
pay exa, not allowlisted   REFUSED  CallNotAllowed            0.3 s
plain transfer()           REFUSED  CallNotAllowed            0.3 s
AlphaUSD, unscoped token   REFUSED  CallNotAllowed            0.3 s
root key pays exa          ALLOWED  33,575 gas                1.6 s
revokeKey                  ALLOWED  28,192 gas                1.7 s
payment from revoked key   REJECTED unnamed internal error   41.7 s
total                                                        58.2 s
```

---

## Three things this interface will not do

**It will not read a budget from the event stream.** Gas is pre-charged against the budget at
the gas limit and partly refunded after the `AccessKeySpend` events fire, so the last event's
`remainingLimit` is stale. Measured gap on an unsponsored payment: 206 units. Every budget on
screen comes from `getRemainingLimitWithPeriod` and carries the block it was read at. The
event value is shown beside it, labelled as telemetry, with the difference spelled out.
`getRemainingLimit` without the period suffix reverts `0xaa4bc69a` on any period-based limit,
which is every Leash key; the console has a one-click check that reproduces that on demand.

**It will not promise a fast kill switch.** `revokeKey` lands in about 28,192 gas and under
two seconds, and the key reads back revoked immediately. The *next payment* from that key is
refused, which is the part that matters, but it takes about 42 seconds and comes back as an
unnamed internal error rather than a named pre-execution rejection. Measured on Moderato
2026-09-19; see `docs/FINDINGS.md` F1. The demo runs it with a visible clock and reports
whatever it gets, including if it disagrees with that measurement. No copy anywhere in this
repository claims an instant named refusal.

The adversarial suite's assertion for this case has been left failing rather than relaxed to
match. A test that asserts the behaviour the spec promised and goes red is worth more than one
edited to agree with what the chain does, and a green suite that had been quietly rewritten
would be exactly the kind of check that cannot fail.

**It will not imply coverage it does not have.** MPP `session`-intent services pay through
`tip20ChannelReserve.open` (`0xedc53b00`) rather than `transferWithMemo`, so a token-scoped
key cannot pay them at all, and even with the channel selector allowlisted, `open` carries the
counterparty inside its calldata and the precompile extracts no recipient from it. Recipient
allowlists have no effect there. The console renders those services as an explicit gap with
the reason, and the policy builder marks them before they are selected.

---

## Testnet only, and why

Everything above runs on Tempo's Moderato testnet, chain 42431.

**MPP itself only exists on mainnet 4217.** Payout addresses are resolved from live 402
challenges against chain 4217 and then enforced on 42431, in PathUSD at
`0x20c0000000000000000000000000000000000000`, which those same challenges quote as an accepted
currency. The `AccountKeychain` enforcement path is identical on both chains. A vendor does
not credit a payment settled on 42431, and the interface says so on the screen where it
matters rather than in a footnote.

**Blocked on a mainnet fee sponsor.** Sponsorship is what makes a budget mean what an operator
thinks it means: sponsored, a 50 USDC budget is 50 USDC of payments; unsponsored, it is 50
USDC of payments minus a gas tax pre-charged at the gas limit. Tempo's Moderato relay at
`https://sponsor.moderato.tempo.xyz` is open and needs no key, and it co-signed every agent
payment in the demo. No equivalent open endpoint is confirmed on mainnet. Authenticated
sponsorship goes through `POST https://api.tempo.xyz/rpc/sponsor` with scope
`rpc-relay:sponsor`, and Tempo console API keys are invite-only. `NETWORKS.mainnet.sponsorUrl`
is deliberately left undefined rather than filled in optimistically, because a client that
silently believes it is sponsored while its budget pays gas is exactly the failure this
product exists to prevent. `docs/CRITICAL-PATH.md` §7 records three fallback designs.

**Mainnet telemetry now works, and did not yesterday.** `https://indexer.tempo.xyz/query`
returned `Payment Required` to an anonymous caller on 2026-09-18 and answers `SELECT` and
decoded `AccessKeySpend` queries with HTTP 200 on 2026-09-19. Because that moved, the console
does not trust a constant: it probes all three telemetry sources on the Data sources tab and
shows the documented claim next to the measured result, with the source selectable. The hosted
API at `https://api.tempo.xyz/v1/indexer/query` is still 402 on both chains and needs an MPP
client to pay per query.

---

## Layout

```
packages/policy   policy compiler, blast-radius index, budget sizing, revert decoding
packages/sdk      chain client, provisioning, reads, payments, indexer, keys, live resolution
apps/console      operator console: server on node:http, hand-written frontend, no build step
apps/demo         the live run: one script, a terminal renderer and an SSE renderer
testnet/          Moderato workspace and the raw verification scripts the docs were written from
docs/             BUILD-SPEC, CRITICAL-PATH, MPP-CATALOG, INDEXER, WIN-CONDITIONS, FINDINGS
```

`apps/console` and `apps/demo` have no frontend build step and no frontend dependencies. The
console signs transactions with a root key, so every package in its request path is attack
surface; `node:http` and a static file server were the whole requirement.

Dependency versions are pinned exactly: `viem@2.56.8`, `ox@0.14.45`, `tsx@4.23.13`,
`typescript@5.9.3`, `vitest@3.2.4`.

---

## Where the numbers come from

Every figure in this README and in both interfaces carries the call that produced it. The
source documents are:

- `docs/BUILD-SPEC.md` for the ABI, the encoding, the selectors and the gas table
- `docs/CRITICAL-PATH.md` for fee sponsorship, with receipts on three independent paths
- `docs/MPP-CATALOG.md` for the catalog, recipient resolution and the shared-payout finding
- `docs/INDEXER.md` for telemetry, the spend classifier and the mainnet census
- `docs/FINDINGS.md` for corrections discovered by running the code
