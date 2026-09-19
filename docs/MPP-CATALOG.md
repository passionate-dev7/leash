# MPP-CATALOG: enumerating services and resolving recipients

MPP is the Machine Payments Protocol, an HTTP 402 payment scheme co-authored by Tempo and
Stripe and submitted to the IETF as `draft-ryan-httpauth-payment`. It is the reason Leash
exists: an agent that can pay any MPP service is an agent that can spend your money at 142
vendors, and today the only thing stopping it is application code.

All data captured 2026-09-18.

---

## 1. The catalog endpoint

```bash
curl -s https://mpp.dev/api/services
```

`HTTP 200`, `application/json`, 540,468 bytes, `{ "version": 1, "services": [...] }`.

| | |
|---|---|
| services | 142 |
| `status: "active"` | 142 (every entry; the field carries no signal today) |
| payable with the `tempo` method | 141 |
| payable with `stripe` | 9 |
| priced endpoints across all services | 1,457 |
| `integration: third-party` / `first-party` | 109 / 33 |
| intents declared | `charge` 144, `session` 8 |
| Tempo settlement asset quoted | `0x20c000000000000000000000b9537d11c60e8b50` on 141 of 141 |
| **services carrying a recipient address** | **0** |

That last row is the whole problem. Full entry shape:

```json
{
  "id": "apex-db",
  "name": "Apex DB",
  "url": "https://apex-db.org",
  "serviceUrl": "https://api.apex-db.org",
  "description": "Search normalized vehicle variants, specifications, emissions…",
  "icon": "https://apex-db.org/icon.svg",
  "categories": ["data", "search"],
  "integration": "third-party",
  "tags": ["automotive", "vehicles", "emissions"],
  "status": "active",
  "docs": { "homepage": "…", "llmsTxt": "…", "apiReference": "…/openapi.json" },
  "methods": { "tempo": { "intents": ["charge"], "assets": ["0x20c0…8b50"] } },
  "realm": "api.apex-db.org",
  "provider": { "name": "Apex DB", "url": "https://apex-db.org" },
  "endpoints": [{
    "method": "GET", "path": "/v1/apex", "description": "Search vehicle variants",
    "payment": { "intent": "charge", "method": "tempo",
                 "currency": "0x20c000000000000000000000b9537d11c60e8b50",
                 "decimals": 6, "amount": "100000", "unitType": "request" }
  }]
}
```

Union of top-level keys across all 142: `id, name, url, serviceUrl, description, icon,
categories, integration, tags, status, docs, methods, realm, provider, endpoints,
supportsCredits`.

Other live discovery surfaces on `mpp.dev`, all verified: `/.well-known/api-catalog`,
`/.well-known/mcp.json` (MCP server at `/api/mcp`, streamable-http),
`/.well-known/agent-skills/index.json`, `/agent-permissions.json` (which explicitly disallows
bots from `execute-payment`), `/llms.txt`, `/llms-full.txt`, `/api/openapi.json`, `/api/ping`.

Categories across the catalog: data 85, web 28, ai 27, search 22, social 13, blockchain 10,
compute 7, media 7, storage 4.

---

## 2. Resolving a recipient, three paths

The catalog gives you price, currency, intent and unit. It never gives you the address the
money goes to. Leash needs that address, because it is what goes in
`SelectorRule.recipients`. Three ways to get it, in order of reliability:

### Path A, the live 402 challenge (universal, authoritative)

Hit the endpoint unauthenticated and decode the `WWW-Authenticate` header.

```bash
curl -sL -D - -o /dev/null https://api.apex-db.org/v1/apex
```

```
HTTP/2 402
www-authenticate: Payment id="…", realm="api.apex-db.org", method="tempo",
  intent="charge", request="<base64url>", description="…", expires="…", opaque="…"
```

```js
const offers = [...header.matchAll(/request="([^"]+)"/g)]
  .map(m => JSON.parse(Buffer.from(m[1], 'base64url').toString()))
```

A header may carry **several** `request=` offers, one per payment method. Pick the one whose
`methodDetails.chainId` is 4217.

```json
{ "amount": "100000",
  "currency": "0x20C000000000000000000000b9537d11c60E8b50",
  "methodDetails": { "chainId": 4217 },
  "recipient": "0x1Ee42717b1c370dACE197a8850Bf41a932F3b5A8" }
```

Charge-intent offers carry `recipient` directly. Session-intent offers carry `recipient` plus
`methodDetails.escrowContract` and `suggestedDeposit`, and the on-chain call goes to the
escrow, not to the recipient. See §5.

Same endpoint also serves an x402-shaped body for x402 clients:

```json
{ "x402Version": 2, "accepts": [{ "scheme": "exact", "network": "eip155:8453",
  "amount": "100000", "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "payTo": "0x1Ee42717b1c370dACE197a8850Bf41a932F3b5A8", "maxTimeoutSeconds": 300 }] }
```

`0x8335…2913` on chain 8453 is USDC on Base. Several services quote both Base and Tempo.
Leash must filter on chain 4217 or it will allowlist a Base address on Tempo.

### Path B, the service's own OpenAPI document

`docs.apiReference` in the catalog. Verified: `https://api.apex-db.org/openapi.json` (7,971
bytes) contains a `"recipient"` key and the address `0x1Ee42717b1c370dACE197a8850Bf41a932F3b5A8`.
Cheaper than probing, but not every service publishes one and it can go stale against the live
challenge.

### Path C, `/.well-known/mpp` (gateway services only)

Verified on `https://openai.mpp.tempo.xyz/.well-known/mpp`, which returns a per-service
document with `methods`, `assets` and `endpoints`. It returns 404 on `api.apex-db.org`, so it
is not universal.

**Recommended resolver for Leash:** B if `docs.apiReference` exists and parses, otherwise A,
with A as the periodic re-validation for everything. Never trust a cached address across an
allowlist rotation; re-resolve before every `authorizeKey`.

---

## 3. What is actually payable today

I probed all 141 tempo-payable services live, one GET endpoint each, path parameters
substituted with `1`.

| outcome | count |
|---|---|
| **HTTP 402 with a decodable challenge** | **44** (43 yielding a chain-4217 recipient) |
| HTTP 400 (endpoint needs required query params before it will challenge) | 65 |
| HTTP 404 | 21 |
| HTTP 401 (gated behind a separate key) | 3 |
| HTTP 200 (free, or free tier not exhausted) | 5 |
| HTTP 500 / 501 | 3 |

**43 services are demonstrably payable today.** The 65 that returned 400 are not dead; they
validate the request before issuing the challenge, so a resolver that supplies the documented
required parameters will recover most of them. Treat 43 as a proven floor, not a ceiling.

**Distinct recipient addresses across those 43: 25.**

| service | realm | recipient | list price | intent |
|---|---|---|---|---|
| `agentfax` | agentfax.val.run | `0xed5bd29c47d40a054591b18cc2142cea8ab7c18a` | $0.20 | charge |
| `agentmail` | mpp.api.agentmail.to | `0x6e3184C204e596dED89E8A5693B602097F4Ab687` | $0 | charge |
| `alchemy` | alchemy.com | `0x7f51327A5A0927815DCcA531aa97Ec7252354091` | $0.001 | charge |
| `allium` | agents.allium.so | `0xeb613ca50aa949844f5d166b8432f8821a358476` | $0.03 | charge |
| `anthropic` | mpp.tempo.xyz | `0xca4e835F803cB0b7C428222B3A3B98518d4779Fe` | $0.01025 | charge |
| `apex-db` | api.apex-db.org | `0x1Ee42717b1c370dACE197a8850Bf41a932F3b5A8` | $0.10 | charge |
| `aviationstack` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.005 | charge |
| `codestorage` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.01 | charge |
| `doma` | mpp.doma.xyz | `0x17ae28d21f80a1082eE3C54AcB03769B09d42DA8` | $0 | charge |
| `exa` | api.exa.ai | `0xB98eF29eb2be19Ae646A8FC0248255B90A332dbC` | $0.007 | charge |
| `fal` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.025 | charge |
| `firecrawl` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.002 | charge |
| `goflightlabs` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.005 | charge |
| `kicksdb` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.0005 | charge |
| `modal` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.013842 | charge |
| `openai` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.005125 | charge |
| `openrouter` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.005125 | charge |
| `orth-agentmail` | mpp.orthogonal.com | `0xaA4a75114b5BdA671844ae10256d2B048dF8fdc3` | $2.00 | charge |
| `orth-company-enrich` | mpp.orthogonal.com | `0xa136b6919A7b3C45c2c793B069ce6e3441AEc32a` | $0.06125 | charge |
| `orth-coresignal` | mpp.orthogonal.com | `0x12E8DE0712aEbe6579A9E16deE2AE9FfCc4E7dC2` | $0.042 | charge |
| `orth-crustdata` | mpp.orthogonal.com | `0x68E8bCC127cd079a79A48e9B7Fa3934DE40a2443` | $0.313 | charge |
| `orth-fantastic-jobs` | mpp.orthogonal.com | `0x673bFe87d96Caa1569583D6cBE69e0ce7AC8640f` | $0.40 | charge |
| `orth-nyne` | mpp.orthogonal.com | `0xd8b2797E90336721A69b5685D5F6A9Ca52b6e8eF` | $0.578 | charge |
| `orth-ocean-io` | mpp.orthogonal.com | `0x31220DD5ae5798cd881E913281E1989A7b91eCeD` | $1.00 | charge |
| `orth-peopledatalabs` | mpp.orthogonal.com | `0x19a09691d0A9c4fB80Cc40694704a15858C6A454` | $0.70 | charge |
| `orth-predictleads` | mpp.orthogonal.com | `0xcA37dE138574432B96F92B0Cd9826DaDFd1cf443` | $0.04 | charge |
| `orth-tako` | mpp.orthogonal.com | `0x8e4A08ac4A195FA8BFd9d4573D4859A9C9882145` | $0.023 | charge |
| `oxylabs` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.007813 | charge |
| `pinata` | mpp.pinata.cloud | `0x23bc10c24f039ba92ab7c6d20b84388efdabad32` | $0.001 | charge |
| `recallradar` | api.recallradar.dev | `0x1Ee42717b1…3b5A8` | $0.10 | charge |
| `rpc` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.001 | charge |
| `rxatlas` | api.rxatlas.dev | `0x1Ee42717b1…3b5A8` | $0.10 | charge |
| `serpapi` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.015 | charge |
| `spyfu` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.01 | charge |
| `stableemail` | stableemail.dev | `0xdb5aa553feeb2c3e3d03e8360b36fb0f7e480671` | $0 | charge |
| `stableenrich` | stableenrich.dev | `0x325bdF6F7efAB24a2210c48c1b64cAb2eAe1d430` | $0.05 | charge |
| `stablephone` | stablephone.dev | `0xD219dB8179Bb9C1899eF87f39eebA9D1070c6801` | $0 | charge |
| `stablesocial` | stablesocial.dev | `0xCfA26F13c6C18307033EcE13BBb8F470dA5b4dbE` | $0 | charge |
| `stablestudio` | stablestudio.dev | `0x07F067959297767c887dbfA3C72379c66E82a045` | $0 | charge |
| `stableupload` | stableupload.dev | `0x06dFF3c8380b5D1799874adA903fc3422882FD6f` | $0 | charge |
| `storage` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.0001 | charge |
| `trialbase-db` | api.trialbase-db.org | `0x1Ee42717b1…3b5A8` | $0.10 | charge |
| `twocaptcha` | mpp.tempo.xyz | `0xca4e835F…4779Fe` | $0.003 | charge |

Not in `/api/services` but very much payable: **the Tempo indexer itself**,
`GET https://api.tempo.xyz/v1/indexer/query`, recipient
`0xfF87284b5cE25620d88533E080Da1Ad97BC320f0`, session intent, $0.0001 per request. See
INDEXER.md.

---

## 4. The finding that changes Leash's product surface

**Recipient-based allowlisting does not isolate gateway-proxied services from each other.**

Sixteen services, including `openai`, `anthropic`, `fal`, `firecrawl`, `modal`, `openrouter`,
`serpapi`, `oxylabs`, `twocaptcha`, `storage` and `rpc`, all resolve to the **same** payout
address `0xca4e835F803cB0b7C428222B3A3B98518d4779Fe`, because they are all served from Tempo's
own gateway at `*.mpp.tempo.xyz`.

So a key scoped to "this agent may only pay OpenAI" is in fact scoped to "this agent may pay
any of sixteen Tempo-gateway services including image generation, scraping, CAPTCHA solving and
an RPC endpoint". The consensus rule is doing exactly what it was told. It was told the wrong
thing.

A weaker version of the same issue: `apex-db`, `rxatlas`, `trialbase-db` and `recallradar` are
four apparently independent businesses on four separate domains that share
`0x1Ee42717b1c370dACE197a8850Bf41a932F3b5A8`.

By contrast, the twelve `mpp.orthogonal.com` services each have a **distinct** recipient, so
recipient scoping does isolate them correctly.

**Leash must:**

1. Compute, for every proposed allowlist, the *true* blast radius: the set of all catalog
   services that share any address on the list. Show that set in the UI before the operator
   signs. This is a genuinely useful thing no dashboard currently does, and it is a direct
   consequence of measuring rather than reading.
2. Mark shared-recipient entries explicitly. "Pay OpenAI" must render as "Pay OpenAI and 15
   other services at this address".
3. Offer budget as the isolation mechanism where recipients cannot isolate: one key per
   service with a budget sized to that service, so a compromised key scoped to the gateway can
   still only burn its own allowance.
4. Never present recipient scoping as per-vendor control without qualification. That would be
   the advisory-control failure mode Leash exists to replace.

Related caveat worth stating in the submission: the catalog names large companies as
`third-party` entries served from proxy domains (`anthropic` at `anthropic.mpp.tempo.xyz`,
`apollo` at `apollo.mpp.paywithlocus.com`). Whether those reflect a commercial relationship
with the named company is UNCONFIRMED from the catalog alone. Leash should surface the
`realm` and `provider` fields verbatim rather than the brand name.

Realm distribution across the catalog: `mpp.paywithlocus.com` 42, `mpp.orthogonal.com` 42,
`mpp.tempo.xyz` 19, remainder on their own domains.

---

## 5. Two payment shapes, two scopes

Determined by decoding the transactions an MPP client actually produced, not from docs.

**`charge` intent** (144 of 152 declared intents). One-time. On-chain this is
`TIP20.transferWithMemo(recipient, amount, memo)` at the token contract. Scope:

```ts
Scopes.tip20(currency).transferWithMemo({ recipients: [payTo] })
// target = currency, selector = 0x95777d59, recipients = [payTo]
```

**`session` intent** (8 declared intents, plus the Tempo indexer). Metered, off-chain vouchers
against an on-chain escrow. The challenge carries
`methodDetails.escrowContract = 0x4d50500000000000000000000000000000000000` (the TIP-20 channel
reserve predeploy, ASCII `MPP`) and `sessionProtocol: "v2"`. On-chain the client calls
`open` (`0xedc53b00`) on the escrow, **not** `transferWithMemo` on the token. Confirmed by
decoding three real transactions my own client produced, each 196 bytes of calldata and
305,793 gas. Scope:

```ts
Scopes.target(CHANNEL_RESERVE).selector('0xedc53b00')   // open
Scopes.target(CHANNEL_RESERVE).selector('0xdc48471e')   // topUp
```

**The recipient allowlist has no effect on a session scope.** `open` carries the counterparty
inside its calldata and the precompile does not extract a recipient from it. For session
services, containment is budget and expiry only. This must be stated plainly in the product;
implying recipient control that does not exist would be worse than offering none.

Practical consequence: a session-intent service is strictly harder to contain than a
charge-intent one, and 144 of 152 intents are charge. Lead the demo with charge.

---

## 6. Generating the allowlist, end to end

```
for each service in GET https://mpp.dev/api/services
  keep if methods.tempo exists
  for each endpoint the operator selected
    resolve recipient:
      try docs.apiReference openapi.json -> payment.recipient
      else GET serviceUrl+path, read WWW-Authenticate, decode base64url request=
      select the offer with methodDetails.chainId == 4217
    classify intent:
      charge   -> scope { target: currency, selector: 0x95777d59, recipients: [recipient] }
      session  -> scope { target: methodDetails.escrowContract, selector: 0xedc53b00 }
  merge scopes by target, union selectorRules, union recipients
  compute blast radius: all catalog services sharing any recipient in the final list
  sum endpoint prices * expected call volume -> proposed TokenLimit.amount
  present blast radius + budget to the operator
  authorizeKey
```

Merging matters: the keychain stores `CallScope[]` keyed by target, and every charge-intent
service settling in the same currency collapses into **one** scope on that token with a union
of recipients. A 40-service allowlist is one `CallScope` with 40 recipients plus one per
session escrow, not 40 scopes. This keeps `authorizeKey` calldata small and the 3.3M gas
provisioning cost flat.

Client library: `mppx@0.10.1` (`github.com/wevm/mppx`, maintained by the viem/wagmi team).
`Mppx.create({ methods: [ ...tempo({ account }) ] })` returns a `fetch` that transparently pays
402s. It accepts an access key directly via
`provider.getMppxParameters({ accessKey: accessKeyAddress })`, which is the integration seam
for Leash. Verified working: it paid the Tempo indexer and returned a `Payment-Receipt` header.

`@mpp/sdk` does not exist. `mpp-client` on npm is an unrelated package.

---

## 7. Why MPP integration is not just brief-satisfaction

MPP's own docs ship a page called "Managing agent spend" whose Tempo section is a short
tutorial on `authorizeKey` limits and scopes. The primitive Leash is built on is the one MPP
tells developers to use. What MPP does not ship is the thing that makes it operable at fleet
scale: allowlist generation from the catalog, blast-radius analysis across shared recipients,
live spend telemetry, and a one-call kill switch across many keys. The mainnet measurement in
INDEXER.md §5 says the same thing from the other side: the enforcement layer is used every day
and the management layer above it has never been touched.
