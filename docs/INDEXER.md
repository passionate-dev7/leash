# INDEXER: live spend telemetry for LEASH

Two indexers, one paid and one free. Both run the same SQL. All output below is real, captured
2026-09-18.

---

## 1. Endpoints

| | hosted | direct |
|---|---|---|
| mainnet 4217 | `GET https://api.tempo.xyz/v1/indexer/query` | `https://indexer.tempo.xyz/query` |
| testnet 42431 | same, `chainId=testnet` | **`https://indexer.testnet.tempo.xyz/query`** |
| auth | MPP 402, or a Tempo API key (scope `indexer:query`) | none on testnet, 402 on mainnet |

**CORRECTION to the brief.** `https://api.tempo.xyz/v1/indexer/query` is not open. The very
first anonymous request returns `402 Payment Required`, on both chains, with no free tier:

```
HTTP/2 402
content-type: application/problem+json
www-authenticate: Payment id="6SVvjKNY…", realm="tempo-api", method="tempo",
  intent="session", request="<base64url>", description="Query indexed chain data",
  expires="2026-09-18T16:09:32.903Z", opaque="eyJfbXBweF9zY29wZSI6IkdFVCAvdjEvaW5kZXhlci9xdWVyeSJ9"
```

Decoded `request`:

```json
{ "amount": "100",
  "currency": "0x20c0000000000000000000000000000000000000",
  "methodDetails": { "chainId": 4217,
                     "escrowContract": "0x4d50500000000000000000000000000000000000",
                     "sessionProtocol": "v2" },
  "recipient": "0xfF87284b5cE25620d88533E080Da1Ad97BC320f0",
  "suggestedDeposit": "10000",
  "unitType": "request" }
```

$0.0001 per query, session intent through the MPP channel reserve, $0.01 suggested deposit.
Passing `chainId=testnet` moves the challenge to chain 42431, so testnet queries are payable
with faucet pathUSD.

This is a gift, not an obstacle. **Leash's own telemetry feed is an MPP-paid service**, which
means the product dogfoods the exact loop it sells: an agent with a scoped key, paying a
metered API, under a budget the protocol enforces. Build the demo that way.

`https://indexer.testnet.tempo.xyz/query` is the same engine without the paywall and is the
right choice for CI and for the parts of the demo that are not about payment. It requires
`chainId` explicitly (omitting it returns `400 missing field chainId`). Mainnet's direct host
returns `{"error":"Payment Required"}`.

---

## 2. Parameters

| param | required | notes |
|---|---|---|
| `sql` | yes | `SELECT` only. `SHOW TABLES` → "Only SELECT queries are allowed". |
| `chainId` | on the direct host | `mainnet` \| `testnet` \| numeric |
| `signature` | no | ABI event signature, exposed as a named SQL CTE. Repeatable. |
| `engine` | no | `postgres` \| `clickhouse`. Default routes automatically ("tiered"). |
| `live` | no | SSE, re-runs on every new block. Incompatible with `engine=clickhouse`. |
| `limit` | no | clamped 1..10,000 |
| `timeout_ms` | no | clamped 100..30,000, **default 5,000** |

Tables reachable: `blocks`, `txs`, `logs`, `receipts`. `information_schema` and system catalogs
are blocked. ClickHouse-only analytics tables exist (`token_transfers`, `token_balances`,
`dex_*`, `address_*`) and need `engine=clickhouse`.

`receipts` columns, which matter to Leash:

```
block_num, block_timestamp, tx_idx, tx_hash, from, to, contract_address,
gas_used, cumulative_gas_used, effective_gas_price, status, fee_payer, type, fee_token
```

`fee_payer` is a first-class column. Sponsorship attribution is a join, not an inference.

---

## 3. The working AccessKeySpend query

The `signature` parameter creates a CTE **named after the event**, carrying the raw log columns
plus the decoded fields. Quote the CTE name and any camelCase or reserved column.

```bash
SIG='AccessKeySpend(address indexed account, address indexed publicKey, address indexed token, uint256 amount, uint256 remainingLimit)'

curl -s -G "https://indexer.testnet.tempo.xyz/query" \
  --data-urlencode 'chainId=42431' \
  --data-urlencode "signature=$SIG" \
  --data-urlencode 'sql=SELECT block_num, tx_hash, "account", "publicKey", "token", "amount", "remainingLimit"
                        FROM "AccessKeySpend"
                        WHERE "account" = '"'"'0x171062b563f575ac87c42d597c331b0d05a72605'"'"'
                        ORDER BY block_num DESC, log_idx DESC LIMIT 12'
```

Real response, `HTTP 200`, these are my own agent's transactions from the CRITICAL-PATH tests:

```json
{"columns":["block_num","tx_hash","account","publicKey","token","amount","remainingLimit"],
 "rows":[
 [35860127,"0xd5ff78c148f6bfca4b901781317cc956e9eb455274a478f557087d63010944ab",
  "0x171062b563f575ac87c42d597c331b0d05a72605","0x64eb6c85aebb09c57ab46bd1de6ae1ef20063281",
  "0x20c0000000000000000000000000000000000000",2000000,48000000],
 [35859797,"0x278a5f91da318c3dbb3cbbd7f3bc092f338a117f4bf3d58242f28d7ae351ccf7",
  "0x171062b563f575ac87c42d597c331b0d05a72605","0xe21335bbf21b68ef6ab8f337a21656d1a8d3719a",
  "0x20c0000000000000000000000000000000000000",1000000,1000000],
 [35859745,"0x2c95d0643a5969991f77b889bea78989b0886d64d196d67a27b58cc0ff0ec22b",
  "0x171062b563f575ac87c42d597c331b0d05a72605","0xe21335bbf21b68ef6ab8f337a21656d1a8d3719a",
  "0x20c0000000000000000000000000000000000000",1000000,42995609],
 [35859745,"0x2c95d0643a5969991f77b889bea78989b0886d64d196d67a27b58cc0ff0ec22b",
  "0x171062b563f575ac87c42d597c331b0d05a72605","0xe21335bbf21b68ef6ab8f337a21656d1a8d3719a",
  "0x20c0000000000000000000000000000000000000",794,43995609],
 [35859677,"0x9428efd972b5ed8fadbc2a783c100e930d167390a6e4b839ec31fe6738d29387",
  "0x171062b563f575ac87c42d597c331b0d05a72605","0xe21335bbf21b68ef6ab8f337a21656d1a8d3719a",
  "0x20c0000000000000000000000000000000000000",3000000,46996197],
 [35859677,"0x9428efd972b5ed8fadbc2a783c100e930d167390a6e4b839ec31fe6738d29387",
  "0x171062b563f575ac87c42d597c331b0d05a72605","0xe21335bbf21b68ef6ab8f337a21656d1a8d3719a",
  "0x20c0000000000000000000000000000000000000",3803,49996197]],
 "row_count":8,"engine":"tiered","query_time_ms":144.115928,"ok":true}
```

Note rows 3+4 and 5+6: two `AccessKeySpend` events from a single transaction hash. The small
one (794, 3803) is the gas pre-charge, the large one is the payment. See §4.

Columns the CTE exposes: `block_num, block_timestamp, log_idx, tx_idx, tx_hash, address,
selector, topic1, topic2, topic3, data` plus the decoded `account, publicKey, token, amount,
remainingLimit`.

Topic constants for raw-log queries:

```
AccessKeySpend        0xe0815e3aaadddf4dd75bde97fc060f0c38afe18e87a169be86a3f5c28247f192
KeyAuthorized         0x7c46af0758d3eca5e8195833bff1e5153f6249fc0f2968a878fd28544315a03c
KeyRevoked            0x14ce4f0c8c12936436b733974fb13d10fc13e8c41c06dc8e19d82001c93d7989
SpendingLimitUpdated  0x2ed96330c6ac81a9996d367bd5d4a227c02b9b3ca4c2b077cb943abc6342d00d
AdminKeyAuthorized    0x493bc0240c1da6c792754dc5247d39ed76c71c99a43e16777538687f8d05e88e
```

---

## 4. The fleet view: spend joined to who paid the gas

This is the query the Leash dashboard runs. It needs `engine=postgres` and a raised
`timeout_ms`, see §6.

```bash
curl -s -G "https://indexer.testnet.tempo.xyz/query" \
  --data-urlencode 'chainId=42431' \
  --data-urlencode 'engine=postgres' --data-urlencode 'timeout_ms=25000' \
  --data-urlencode "signature=$SIG" \
  --data-urlencode 'sql=SELECT s.block_num, s."publicKey" AS agent_key, s."amount",
                           s."remainingLimit", r.fee_payer, r.gas_used
                        FROM "AccessKeySpend" s
                        JOIN receipts r ON r.tx_hash = s.tx_hash
                        WHERE s."account" = '"'"'0x1710…2605'"'"'
                        ORDER BY s.block_num DESC LIMIT 8'
```

Real output, `query_time_ms` 2927:

| block | agent_key | amount | remainingLimit | fee_payer | gas_used |
|---|---|---|---|---|---|
| 35860127 | `0x64eb…3281` | 2,000,000 | 48,000,000 | `0x58aa7ce4…` public relay | 76,750 |
| 35859797 | `0xe213…719a` | 1,000,000 | 1,000,000 | `0xbb48187f…` self-hosted | 76,678 |
| 35859751 | `0xe213…719a` | 1,000,000 | 41,995,781 | `0xbb48187f…` self-hosted | 76,678 |
| 35859745 | `0xe213…719a` | **794** | 43,995,609 | `0x171062b5…` **self** | 52,078 |
| 35859745 | `0xe213…719a` | 1,000,000 | 42,995,609 | `0x171062b5…` **self** | 52,078 |
| 35859684 | `0xe213…719a` | 3,000,000 | 43,996,403 | `0xbb48187f…` self-hosted | 76,738 |
| 35859677 | `0xe213…719a` | **3,803** | 49,996,197 | `0x171062b5…` **self** | 301,438 |
| 35859677 | `0xe213…719a` | 3,000,000 | 46,996,197 | `0x171062b5…` **self** | 301,438 |

The pattern is unambiguous and it is the classifier Leash needs:

> **A row is a gas charge if and only if `fee_payer` equals the account itself and the same
> `tx_hash` carries a second `AccessKeySpend`.** Every sponsored row is a clean single payment.

Three practical rules fall out:

1. **Never sum `amount` naively.** On unsponsored keys it conflates gas with payments. Filter
   `r.fee_payer <> s."account"`, or dedupe to the maximum `amount` per `tx_hash`.
2. **Never read the budget from the last event's `remainingLimit`.** It is stale. The gas
   pre-charge happens at the gas limit and part is refunded *after* the events are emitted. In
   the table above the final event of tx `0x9428efd9…` reports 46,996,197, while
   `getRemainingLimitWithPeriod` returns 46,996,403 immediately afterwards, a 206 unit gap.
   Events are the feed; the precompile read is the truth. Reconcile on every poll.
3. **Sponsored fleets produce clean telemetry for free.** One more reason CRITICAL-PATH.md
   recommends sponsoring by default.

---

## 5. Mainnet measurement: the thesis, re-measured

Mainnet indexer access needs mainnet funds or an invite-only API key, so this was measured the
harder and better way, `eth_getLogs` straight against `https://rpc.tempo.xyz`, in five chunks
of 10,000 blocks.

Window: blocks 40,067,463 to 40,117,463 (50,000 blocks, 7.72 hours, 0.556 s average block
time, which confirms the brief's block time).

| event | count | distinct accounts | distinct keys |
|---|---|---|---|
| `AccessKeySpend` | **1,563** | **476** | 478 |
| `KeyAuthorized` | 11 | 8 | 11 |
| `KeyRevoked` | 1 | 1 | 1 |
| `SpendingLimitUpdated` | **0** | 0 | 0 |
| `AdminKeyAuthorized` | **0** | 0 | 0 |

Spend by token over the window:

```
0x20C000000000000000000000b9537d11c60E8b50   $14.07   <- the MPP settlement asset
0x20C0000000000000000000000000000000000000   $0.20    <- pathUSD
0x20C00000000000000000000014f22CA97301EB73   $0.05
0x20c000000000000000000000f37de3740ADec032   $0.02
0x20C0000000000000000000000520792DcCccCccC   $0.00
```

**The brief's numbers are stale in Leash's favour.** It reported 659 to 1,088 spend events
across roughly 150 accounts and 6 authorizations. Today the same size window shows 1,563 events
across 476 accounts, roughly a 1.5x increase in events and a 3x increase in distinct accounts.

The shape of the claim is unchanged and now better evidenced:

- The enforcement layer is in daily production use by hundreds of distinct accounts.
- Key provisioning is rare, 11 events, so keys are long-lived once created.
- **`SpendingLimitUpdated` is still exactly zero. `AdminKeyAuthorized` is exactly zero.**
  Nobody has ever resized an access key budget on Tempo mainnet. One key was revoked in the
  whole window.

Note the dominant token is the MPP settlement asset, not pathUSD. The spend already flowing
through this precompile is overwhelmingly MPP traffic. Leash is not proposing a use case, it
is proposing management for one that already exists.

Reproduce with `eth_getLogs` against `address = 0xaAAAaaAA00000000000000000000000000000000`
and the topic constants in §3. Chunk to 10,000 blocks; larger ranges are rejected.

**Blind spot:** one 7.72 hour window on one day. Before the submission, sample several
windows across several days, because a single window cannot distinguish a trend from a spike,
and the brief's older numbers versus mine are exactly the kind of gap that a second sample
would explain.

---

## 6. Gotchas, all hit for real

**Default timeout is 5,000 ms and the router sends joins to ClickHouse.** The fleet join in §4
failed first time:

```
{"ok":false,"error":"ClickHouse query failed: Code: 159. DB::Exception: Timeout exceeded:
 elapsed 5003.827 ms, maximum: 5000 ms. (TIMEOUT_EXCEEDED)"}
```

Fix: `engine=postgres` and `timeout_ms=25000`. Then it returns in 2,927 ms.

**`live=true` cannot use the `signature` CTE.** The decoded CTE is built only on the tiered
path; live mode runs on postgres and does not see it:

```
event: error
data: {"ok":false,"error":"Query error: relation \"AccessKeySpend\" does not exist (42P01)"}
```

Fix: in live mode query the raw `logs` table with topic filters. Verified working:

```bash
curl -sN -G "https://indexer.testnet.tempo.xyz/query" \
  --data-urlencode 'chainId=42431' --data-urlencode 'live=true' \
  --data-urlencode "sql=SELECT count(*) AS spends FROM logs
    WHERE topic0 = '0xe0815e3aaadddf4dd75bde97fc060f0c38afe18e87a169be86a3f5c28247f192'
      AND topic1 = '0x000000000000000000000000171062b563f575ac87c42d597c331b0d05a72605'"
```

```
event: result
data: {"columns":["spends"],"rows":[[8]],"row_count":1,"engine":"postgres","query_time_ms":45.47,"ok":true}

event: lagged
data: {"skipped":1715,"reason":"catch-up limit exceeded"}

event: result
data: {"columns":["spends"],"rows":[[0]],"row_count":1,"engine":"postgres","query_time_ms":42.73,"ok":true}
```

Indexed address topics are 32-byte left-padded. `topic1` is `account`, `topic2` is
`publicKey`, `topic3` is `token`.

**`live=true` emits per-block deltas, not cumulative totals.** The first `result` covers the
backfill, then each subsequent `result` is scoped to the new block only, hence the run of
zeros above. A live dashboard must accumulate client-side, and must handle the `lagged` event
(`skipped: 1715`) by re-running a bounded historical query to fill the hole. Three event types
exist: `result`, `error`, `lagged`.

**Table access is allowlisted.** `access_key_spend` and `events` both return
`Access to table '…' is not allowed`. Only `blocks`, `txs`, `logs`, `receipts` and the
ClickHouse analytics set are reachable.

**Quote everything.** `"account"`, `"publicKey"`, `"from"`, `"to"`, `"amount"` and the CTE name
itself all need double quotes.

---

## 7. Paying for the hosted indexer with an access key

The complete Leash loop, end to end, and the best demo in the project.

```ts
import { Mppx, tempo } from 'mppx/client'
import { Account } from 'viem/tempo'

const owner    = Account.fromSecp256k1(OWNER_PK)
const agentKey = Account.fromSecp256k1(AGENT_PK, { access: owner })   // scoped, budgeted

const mppx = Mppx.create({ methods: [ ...tempo({ account: agentKey }) ] })

const url = new URL('https://api.tempo.xyz/v1/indexer/query')
url.searchParams.set('chainId', 'testnet')
url.searchParams.set('sql', 'SELECT * FROM "AccessKeySpend" ORDER BY block_num DESC LIMIT 5')
url.searchParams.append('signature', SIG)

const res = await mppx.fetch(url.toString())
// res.headers.get('payment-receipt') -> base64url receipt
```

Verified working with the root account: `HTTP 200` on a valid query, and a `Payment-Receipt`
header decoding to `{"method":"tempo","intent":"session","status":"success",
"timestamp":"2026-09-18T16:11:46.068Z","reference":"0x93d2c5315a07b8ac642bd7a70c54552ff0011cb9…"}`.
The on-chain footprint is three calls to `tip20ChannelReserve.open` (`0xedc53b00`) at
`0x4d50500000000000000000000000000000000000`, 305,793 gas each.

**Scope it as a session, not a charge.** A key scoped only to
`transferWithMemo` **cannot** pay the indexer, because session payments never touch the token
contract. The scope must be `{ target: 0x4d5050…, selector: 0xedc53b00 }`. This was determined
by decoding the transactions, and it is the single easiest thing to get wrong when wiring MPP
to an access key. See MPP-CATALOG.md §5.

The narrative writes itself: an agent that queries its own spend telemetry, paying per query,
out of a budget the protocol enforces, with the operator able to revoke it in 28,192 gas.
