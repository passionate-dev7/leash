# LEASH BUILD-SPEC

Everything here was read from shipped source or produced by a transaction on Moderato
(chain 42431) on 2026-09-18. Nothing is copied from a blog post. Where a fact could not be
confirmed it says UNCONFIRMED.

Provenance for the ABI: `viem@2.56.8`, entrypoint `viem/tempo`, file `tempo/Abis.ts`, whose
header reads `// Generated with pnpm gen:tempo-abis` / `// Source: tempoxyz/tempo@d656ef5581505b59f1611b358e611f5a602d399e`.
Do not hand-transcribe any of this. Import it.

```ts
import { Abis, Addresses, Selectors, Scopes, Account, Actions, Transport, Expiry } from 'viem/tempo'
import { tempo, tempoModerato } from 'viem/chains'
```

---

## 1. Networks

| | Tempo mainnet | Moderato testnet |
|---|---|---|
| chain id | 4217 (`eth_chainId` → `0x1079`, verified) | 42431 (`0xa5bf`, verified) |
| RPC | `https://rpc.tempo.xyz` | `https://rpc.moderato.tempo.xyz` |
| viem chain | `tempo` | `tempoModerato` |
| block time | 0.556 s measured over 50,000 blocks (7.72 h span) | ~0.5 s |
| free indexer | none, `indexer.tempo.xyz` returns 402 | `https://indexer.testnet.tempo.xyz/query`, open |
| free fee sponsor | UNCONFIRMED | `https://sponsor.moderato.tempo.xyz`, open |
| faucet | none (`tempo_fundAddress` exists but the faucet account is unfunded) | `tempo_fundAddress` RPC |

No native token. `eth_getBalance` returns the fixed sentinel
`4242424242424242424242424242424242424242424242424242424242424242424242424242`
(verified on Moderato). Gas is paid in a TIP-20 token named by the transaction's `fee_token`
field. Transaction type is `0x76`.

### Faucet

```bash
curl -s https://rpc.moderato.tempo.xyz -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tempo_fundAddress","params":["0xYOURADDR"]}'
```

Returns four transaction hashes, one per token, each minting 1,000,000.000000 units:

| symbol | address | decimals |
|---|---|---|
| PathUSD | `0x20c0000000000000000000000000000000000000` | 6 |
| AlphaUSD | `0x20c0000000000000000000000000000000000001` | 6 |
| BetaUSD | `0x20c0000000000000000000000000000000000002` | 6 |
| ThetaUSD | `0x20c0000000000000000000000000000000000003` | 6 |

On mainnet, `0x20c0000000000000000000000000000000000000` is pathUSD, and the asset MPP
actually settles in is `0x20c000000000000000000000b9537d11c60e8b50` (141 of 142 catalogued
services quote it). Build the mainnet allowlist against the latter.

---

## 2. Predeploy addresses

From `viem/tempo/Addresses.ts`, all confirmed to carry code (`eth_getCode` → `0xef`) on both
chains.

| name | address | why Leash cares |
|---|---|---|
| `accountKeychain` | `0xaAAAaaAA00000000000000000000000000000000` | the enforcement layer, all of Leash |
| `tip20ChannelReserve` | `0x4d50500000000000000000000000000000000000` | MPP **session** payments land here, not on the token |
| `pathUsd` | `0x20c0000000000000000000000000000000000000` | |
| `tip20Factory` | `0x20fc000000000000000000000000000000000000` | |
| `feeManager` | `0xfeec000000000000000000000000000000000000` | |
| `receivePolicyGuard` | `0xB10C000000000000000000000000000000000000` | |
| `addressRegistry` | `0xfdc0000000000000000000000000000000000000` | virtual address resolution |
| `signatureVerifier` | `0x5165300000000000000000000000000000000000` | `verifyKeychain` |

Note `0x4d5050` is ASCII `MPP`. That is not a coincidence, it is the MPP payment channel.

---

## 3. AccountKeychain ABI, exact

### 3.1 The struct (canonical Solidity, field names match the ABI)

```solidity
enum SignatureType { Secp256k1, P256, WebAuthn }   // 0, 1, 2

struct TokenLimit   { address token; uint256 amount; uint64 period; }
struct SelectorRule { bytes4 selector; address[] recipients; }
struct CallScope    { address target; SelectorRule[] selectorRules; }

struct KeyRestrictions {
    uint64       expiry;
    bool         enforceLimits;
    TokenLimit[] limits;
    bool         allowAnyCalls;
    CallScope[]  allowedCalls;
}

struct KeyInfo { SignatureType signatureType; address keyId; uint64 expiry; bool enforceLimits; bool isRevoked; }
```

### 3.2 CORRECTION to the incoming brief

The brief described `authorizeKey` as taking only the nested `KeyRestrictions` tuple plus a
trailing `bytes`. That is wrong and will not produce selector `0x980a6025`.

```
WRONG  authorizeKey((uint64,bool,(address,uint256,uint64)[],bool,(address,(bytes4,address[])[])[]),bytes)
       -> 0x7e99b39a

RIGHT  authorizeKey(address,uint8,(uint64,bool,(address,uint256,uint64)[],bool,(address,(bytes4,address[])[])[]))
       -> 0x980a6025   (matches viem/tempo/Selectors.ts exactly)
```

The two leading parameters are `address keyId` and `uint8 signatureType`. There is no
trailing `bytes`.

### 3.3 Selector table

Verbatim from `viem/tempo/Selectors.ts`.

| function | selector |
|---|---|
| `authorizeKey(address,uint8,(uint64,bool,(address,uint256,uint64)[],bool,(address,(bytes4,address[])[])[]))` | `0x980a6025` |
| same, with trailing `bytes32 witness` | `0xe3c154d2` |
| `authorizeKey(address,uint8,uint64,bool,(address,uint256)[])` (legacy, no period, no scopes) | `0x54063a55` |
| `authorizeAdminKey(address,uint8,bytes32)` | `0x9a424307` |
| `revokeKey(address)` | `0x5ae7ab32` |
| `updateSpendingLimit(address,address,uint256)` | `0xcbbb4480` |
| `setAllowedCalls(address,(address,(bytes4,address[])[])[])` | `0xf5456703` |
| `removeAllowedCalls(address,address)` | `0xf3941811` |
| `getKey(address,address)` | `0xbc298553` |
| `getRemainingLimit(address,address,address)` | `0x63b4290d` |
| `getRemainingLimitWithPeriod(address,address,address)` | `0xa7f72cab` |
| `getAllowedCalls(address,address)` | `0x0163e7ec` |
| `isAdminKey(address,address)` | `0x9009a18d` |
| `getTransactionKey()` | `0xb07fbc1a` |
| `burnKeyAuthorizationWitness(bytes32)` | `0xcff31c46` |
| `isKeyAuthorizationWitnessBurned(address,bytes32)` | `0x8e6c7e11` |

TIP-20, same file: `transferWithMemo(address,uint256,bytes32)` = `0x95777d59` (confirmed),
`transfer` = `0xa9059cbb`, `transferFromWithMemo` = `0x929c2539`, `mintWithMemo` = `0xe44f0b12`,
`burnWithMemo` = `0x38f23b0b`.

TIP-20 channel reserve: `open` = `0xedc53b00`, `topUp` = `0xdc48471e`, `settle` = `0x97fb5104`,
`close` = `0x73b57f74`, `requestClose` = `0x675402e5`, `withdraw` = `0x41e2c664`.

### 3.4 Read return shapes

```
getRemainingLimitWithPeriod(account, keyId, token) -> (uint256 remaining, uint64 periodEnd)
getAllowedCalls(account, keyId)                    -> (bool isScoped, CallScope[] scopes)
getKey(account, keyId)                             -> KeyInfo
```

**Trap.** `getRemainingLimit` reverts with the custom error `0xaa4bc69a` for a key whose limit
was created with a non-zero `period`, while `getRemainingLimitWithPeriod` succeeds on the same
key in the same block. Leash must call the `WithPeriod` form and never the short one.
(`0xaa4bc69a` is not in the published ABI's error list, so it decodes to nothing; whether the
short form works for period-less limits was not measured.) Observed live:

```
getRemainingLimit            -> REVERT 0xaa4bc69a
getRemainingLimitWithPeriod  -> ["50000000","1792339682"]
```

### 3.5 Event topics, computed and cross-checked against mainnet logs

| event | topic0 |
|---|---|
| `AccessKeySpend(address,address,address,uint256,uint256)` | `0xe0815e3aaadddf4dd75bde97fc060f0c38afe18e87a169be86a3f5c28247f192` |
| `KeyAuthorized(address,address,uint8,uint64)` | `0x7c46af0758d3eca5e8195833bff1e5153f6249fc0f2968a878fd28544315a03c` |
| `KeyRevoked(address,address)` | `0x14ce4f0c8c12936436b733974fb13d10fc13e8c41c06dc8e19d82001c93d7989` |
| `SpendingLimitUpdated(address,address,address,uint256)` | `0x2ed96330c6ac81a9996d367bd5d4a227c02b9b3ca4c2b077cb943abc6342d00d` |
| `AdminKeyAuthorized(address,address)` | `0x493bc0240c1da6c792754dc5247d39ed76c71c99a43e16777538687f8d05e88e` |

`AccessKeySpend` indexes `account`, `publicKey`, `token`. `amount` and `remainingLimit` are in
the data blob. The brief's abbreviated `0xe0815e3a…` is correct.

### 3.6 Errors a Leash UI must render

`SpendingLimitExceeded`, `CallNotAllowed`, `KeyExpired`, `KeyNotFound`, `KeyAlreadyRevoked`,
`KeyAlreadyExists`, `InvalidCallScope`, `InvalidKeyId`, `InvalidSpendingLimit`,
`ZeroPublicKey`, `ExpiryInPast`, `UnauthorizedCaller`, `SignatureTypeMismatch(uint8,uint8)`,
`InvalidKeyAuthorizationWitness`, `KeyAuthorizationWitnessAlreadyBurned`,
`LegacyAuthorizeKeySelectorChanged(bytes4)`.

---

## 4. Worked example: 50 USDC per 30 days, three MPP recipients, transferWithMemo only

Target policy: *this agent may spend 50 USDC per 30 days, only to these three MPP recipients,
only via `transferWithMemo`.*

The three recipients below are real, resolved from live MPP 402 challenges on 2026-09-18
(see MPP-CATALOG.md). The token is the MPP settlement asset on mainnet.

```ts
const USDC   = '0x20c000000000000000000000b9537d11c60e8b50'
const KEYID  = '0x64eb6C85AEbb09C57ab46Bd1dE6AE1Ef20063281'
const R = [
  '0xca4e835F803cB0b7C428222B3A3B98518d4779Fe', // Tempo MPP gateway (openai, anthropic, fal, …)
  '0xB98eF29eb2be19Ae646A8FC0248255B90A332dbC', // Exa
  '0x1Ee42717b1c370dACE197a8850Bf41a932F3b5A8', // Apex DB / RxAtlas / TrialBase / RecallRadar
]

const config = {
  expiry:        1792000000n,          // uint64 unix seconds
  enforceLimits: true,
  limits: [{ token: USDC, amount: 50_000000n, period: 2_592_000n }],  // 50 * 10^6, 30 days
  allowAnyCalls: false,
  allowedCalls: [{
    target: USDC,
    selectorRules: [{ selector: '0x95777d59', recipients: R }],
  }],
}
```

`Scopes.tip20(USDC).transferWithMemo({ recipients: R })` produces exactly that `allowedCalls`
entry and is the preferred way to write it.

### 4.1 Encoded calldata (produced, not hand-written)

`to = 0xaAAAaaAA00000000000000000000000000000000`, 772 bytes.

```
0x980a6025
 [00] 00000000000000000000000064eb6c85aebb09c57ab46bd1de6ae1ef20063281  keyId
 [01] 0000000000000000000000000000000000000000000000000000000000000000  signatureType = 0 (secp256k1)
 [02] 0000000000000000000000000000000000000000000000000000000000000060  offset -> config
 [03] 000000000000000000000000000000000000000000000000000000006acfc000  config.expiry = 1792000000
 [04] 0000000000000000000000000000000000000000000000000000000000000001  config.enforceLimits = true
 [05] 00000000000000000000000000000000000000000000000000000000000000a0  offset -> limits
 [06] 0000000000000000000000000000000000000000000000000000000000000000  config.allowAnyCalls = false
 [07] 0000000000000000000000000000000000000000000000000000000000000120  offset -> allowedCalls
 [08] 0000000000000000000000000000000000000000000000000000000000000001  limits.length = 1
 [09] 00000000000000000000000020c000000000000000000000b9537d11c60e8b50  limits[0].token
 [10] 0000000000000000000000000000000000000000000000000000000002faf080  limits[0].amount = 50_000000
 [11] 0000000000000000000000000000000000000000000000000000000000278d00  limits[0].period = 2592000
 [12] 0000000000000000000000000000000000000000000000000000000000000001  allowedCalls.length = 1
 [13] 0000000000000000000000000000000000000000000000000000000000000020  offset -> allowedCalls[0]
 [14] 00000000000000000000000020c000000000000000000000b9537d11c60e8b50  allowedCalls[0].target
 [15] 0000000000000000000000000000000000000000000000000000000000000040  offset -> selectorRules
 [16] 0000000000000000000000000000000000000000000000000000000000000001  selectorRules.length = 1
 [17] 0000000000000000000000000000000000000000000000000000000000000020  offset -> selectorRules[0]
 [18] 95777d5900000000000000000000000000000000000000000000000000000000  selector = transferWithMemo
 [19] 0000000000000000000000000000000000000000000000000000000000000040  offset -> recipients
 [20] 0000000000000000000000000000000000000000000000000000000000000003  recipients.length = 3
 [21] 000000000000000000000000ca4e835f803cb0b7c428222b3a3b98518d4779fe
 [22] 000000000000000000000000b98ef29eb2be19ae646a8fc0248255b90a332dbc
 [23] 0000000000000000000000001ee42717b1c370dace197a8850bf41a932f3b5a8
```

Note word [18]: `bytes4` is left-aligned inside its 32-byte word. Getting this wrong is the
single most common encoding mistake here.

### 4.2 How the key is actually provisioned

**Do not send the calldata above as a plain transaction.** It is correct, and it is the right
thing to put in a doc so a reader can verify the shape, but the path the protocol and the SDK
actually use is different and cheaper to reason about: the authorization travels as a
`key_authorization` field *inside* the type-`0x76` envelope of any transaction, signed by the
root key. The node installs the key before verifying the transaction signature.

```ts
const owner    = Account.fromSecp256k1(OWNER_PK)
const agentKey = Account.fromSecp256k1(AGENT_PK, { access: owner })

const hash = await Actions.accessKey.authorize(client, {
  accessKey: agentKey,
  expiry: Math.floor(Date.now() / 1000) + 7 * 86400,
  limits: [{ token: USDC, limit: 50_000000n, period: 2_592_000 }],
  scopes: [ Scopes.tip20(USDC).transferWithMemo({ recipients: R }) ],
})
```

Verified live on Moderato, tx `0x7d773d36c10f6908a28236393b2ad6892b51a4f7b4b0fe010fa24fb5a31baa6e`.
The receipt shows `to = 0x0000…0000` because there is no call, only the envelope field.

**Trap.** An access key account object reports `.address` as the **parent account's** address,
not the key's. The key id is `.accessKeyAddress`. Every `getKey` / `getRemainingLimitWithPeriod`
/ `getAllowedCalls` read takes `(rootAccount, keyId)` and silently returns zeros if you pass
`.address` for the second argument. This cost a debugging cycle. Read it from the
`KeyAuthorized` event's `publicKey` field if in doubt.

### 4.3 Read-back proof

```
getKey                       -> {"signatureType":0,"keyId":"0xE21335Bb…","expiry":"1790352481",
                                 "enforceLimits":true,"isRevoked":false}
getRemainingLimitWithPeriod  -> ["50000000","1792339682"]
getAllowedCalls              -> [true,[{"target":"0x20C0…0000",
                                 "selectorRules":[{"selector":"0x95777d59",
                                 "recipients":["0x3Ea86ae0…"]}]}]]
```

---

## 5. The gas-debits-budget correction, with real arithmetic

**The trap is real and the brief is right about the mechanism.** It is wrong about the
magnitude, and it misses the fix.

Measured on Moderato, unsponsored, transferring 3.000000 PathUSD from a key capped at 50 USDC:

```
tx 0x9428efd972b5ed8fadbc2a783c100e930d167390a6e4b839ec31fe6738d29387
gasUsed 301,438   effectiveGasPrice 11,930,452,729 wei

AccessKeySpend  amount=3,803      remainingLimit=49,996,197   <- gas pre-charge at gas LIMIT
AccessKeySpend  amount=3,000,000  remainingLimit=46,996,197   <- the actual payment
post-tx getRemainingLimitWithPeriod -> 46,996,403             <- 206 refunded after the events
```

So the budget moved by **3,003,597** for a 3,000,000 payment. Overhead 3,597 units, 0.12%.

Two things a builder must internalise:

1. **Gas is pre-charged against the budget at the gas limit, then partially refunded.** The
   `AccessKeySpend` event stream therefore *overstates* gas spend, and the final
   `remainingLimit` in the last event of a transaction is **not** the post-transaction
   remaining limit. Leash must reconcile telemetry against
   `getRemainingLimitWithPeriod` and never trust the last event's `remainingLimit` alone.
2. **Gas spend and payment spend are indistinguishable by event type.** Both are
   `AccessKeySpend` on the same token from the same key. Leash must classify them, and the
   only reliable discriminator is position and correlation with the call: see INDEXER.md §4.

Fee conversion, derived from the measurement:

```
fee_in_token_units = ceil(gasUsed * effectiveGasPrice / 10^12)
  301,438 * 11,930,452,729 / 10^12 = 3,596.3  -> charged 3,597   (matches)
   76,738 * 11,930,452,729 / 10^12 =   915.5  -> charged   916   (matches)
```

The `10^12` is the 18-decimal wei to 6-decimal token scaling. For a token with `d` decimals
substitute `10^(18-d)`.

### 5.1 The fix, which the brief did not have

**Sponsor the fee and the overhead goes to exactly zero.** Same key, same policy, same
payment, with a fee payer attached:

```
tx 0x2c2b9fc25af39574b8f28d143b1a31a3b526658c3d94d8007ab146d2a9732374
budget spent  3,000,000   (transfer was 3,000,000)
OWNER  delta  -3,000,000
SPONSOR delta      -916
one AccessKeySpend event only: amount=3,000,000
```

The gas `AccessKeySpend` does not appear at all. A sponsored access key's budget is a clean
payment budget. This is the single most important design consequence in this document and it
is why Leash should sponsor by default. Full receipts in CRITICAL-PATH.md.

### 5.2 Budget sizing rule

| mode | budget needed to guarantee N payments of `amt` |
|---|---|
| unsponsored | `N * amt * 1.005` plus a floor of `N * ceil(gasLimit * maxFeePerGas / 10^(18-d))`. Use the **gas limit**, not gas used, because the pre-charge is at the limit. |
| sponsored | `N * amt` exactly |

Do not compute the unsponsored headroom from observed `gasUsed`. A transaction submitted with
a generous gas limit pre-charges the full limit and can trip `SpendingLimitExceeded` on a
payment that would otherwise fit.

---

## 6. Lifecycle call sequences, with measured gas

All on Moderato, fee token PathUSD, `effectiveGasPrice` 11,930,452,729.

| operation | how | gas | tx |
|---|---|---|---|
| provision key | `keyAuthorization` in the envelope | 3,552,100 first / 3,302,100 subsequent | `0x96c9531c…`, `0x7d773d36…` |
| payment, unsponsored, cold | `transferWithMemo` | 301,438 | `0x9428efd9…` |
| payment, unsponsored, warm | `transferWithMemo` | 52,078 | `0x2c95d064…` |
| payment, sponsored | `transferWithMemo` + fee payer | 76,738 | `0x2c2b9fc2…` |
| payment, relay-sponsored | `transferWithMemo` + public relay | 76,750 | `0xd5ff78c1…` |
| resize budget | `updateSpendingLimit` | 36,299 | `0x027b4e0b…` |
| **kill switch** | `revokeKey` | **28,192** | `0xb09ec732…` |
| MPP session channel open | `tip20ChannelReserve.open` | 305,793 | `0xd25bc839…` |

Provisioning is roughly 120x the cost of revoking. Leash's key-per-agent model should
therefore treat provisioning as a deliberate, batched act and revocation as free and instant.

### 6.1 Kill switch, proven

```
revokeKey(0x64eb…)   gas 28,192   wallclock 2,820 ms from submit to receipt
  KeyRevoked(account=0x1710…, publicKey=0xE213…)
  getKey -> {"keyId":"0x0000…0000","expiry":"0","enforceLimits":false,"isRevoked":true}

post-revoke spend attempt with the same key  -> REJECTED by the node before execution
control: root key spend immediately after    -> success, tx 0xddb5db12…
```

The post-revoke rejection happens at signature resolution, not as an EVM revert, so it never
reaches a block and costs nothing. Leash should surface this as "rejected, not reverted" so an
operator understands the key is gone rather than merely blocked.

### 6.2 `updateSpendingLimit` semantics

It **resets** the remaining budget for the current period to the new limit, it does not scale
it. Going from a 50 USDC cap with 43.99 remaining to a 2 USDC cap produced
`getRemainingLimitWithPeriod -> ["2000000", <unchanged periodEnd>]`. A subsequent 1 USDC
payment succeeded and a 5 USDC payment reverted `SpendingLimitExceeded`. This means
`updateSpendingLimit` doubles as a mid-period budget top-up, which is a feature Leash should
expose deliberately rather than by accident.

---

## 7. Scoping rules that actually bite

Verified by transacting. Every negative case below was a real submitted transaction against a
key scoped to `{PathUSD, transferWithMemo, [MERCHANT_A]}` with a 50 USDC / 30 day cap.

| case | result |
|---|---|
| allowed merchant, allowed selector, in budget | **success** |
| different recipient (`MERCHANT_B`) | revert `CallNotAllowed` |
| plain `transfer()` to the **allowed** merchant | revert `CallNotAllowed` |
| over budget | revert `SpendingLimitExceeded` |
| **different token** (AlphaUSD) to the allowed merchant | revert `CallNotAllowed` |
| root key doing any of the above | **success** (control) |
| every failing case above, **with fee sponsorship attached** | still reverts, identically |

Consequences for Leash:

- The recipient allowlist is enforced **per selector**, not per target. A key scoped to
  `transferWithMemo` cannot escape through `transfer`. Confirmed, not assumed.
- A scope is a `(target, selector, recipients)` triple. Restricting the token is free: the
  target address *is* the token contract, so an unlisted token is an unlisted target.
- `allowAnyCalls = false` with `allowedCalls = []` is **scoped deny-all**, not allow-all.
  `getAllowedCalls` returning `[true, []]` means the key can call nothing.
- Sponsorship is not an escape hatch. See CRITICAL-PATH.md §5.

### 7.1 Scoping MPP, which has two shapes

This is the part a builder will get wrong without being told.

| MPP intent | on-chain call | what to put in `allowedCalls` |
|---|---|---|
| `charge` (one-time, 144 of 152 catalogued intents) | `TIP20.transferWithMemo(recipient, amount, memo)` | `target = token`, `selector = 0x95777d59`, `recipients = [payTo]` |
| `session` (metered, 8 catalogued intents) | `tip20ChannelReserve.open(...)` at `0x4d5050…` | `target = 0x4d50500000000000000000000000000000000000`, `selector = 0xedc53b00` (plus `0xdc48471e` topUp) |

Confirmed by decoding the transactions my own MPP client produced against the Tempo indexer,
which is a session-intent service: three transactions to `0x4d5050…` with selector `0xedc53b00`,
196 bytes of calldata, 305,793 gas each.

**The recipient allowlist does not constrain a session payment.** `open` takes the counterparty
inside its calldata, and `SelectorRule.recipients` is only matched for selectors the precompile
knows how to extract a recipient from. A key scoped to the channel reserve can open a channel
with anyone. For session-intent services Leash's containment is the **budget and the expiry**,
not the recipient list. Say this in the product rather than implying recipient-level control
that does not exist there.

---

## 8. Signature envelopes

| type | prefix | layout |
|---|---|---|
| secp256k1 | none | `r‖s‖v`, 65 bytes |
| P256 | `0x01` | `r‖s‖pubX‖pubY‖preHash` |
| WebAuthn | `0x02` | `authenticatorData‖clientDataJSON‖r‖s‖pubX‖pubY` |
| Keychain V1 | `0x03` | `0x03 ‖ userAddress(20) ‖ inner` — **deprecated at hardfork T1C** |
| Keychain V2 | `0x04` | `0x04 ‖ userAddress(20) ‖ inner` — **use this** |
| Multisig | `0x05` | `0x05 ‖ rlp([account, config, …])` |

Access key sign payload, V2: `keccak256(0x04 ‖ sigHash ‖ rootAddress)`. In `ox` that is
`TxEnvelopeTempo.getSignPayload(envelope, { from: rootAddress })`. `viem/tempo`'s
`Account.fromSecp256k1(pk, { access: root })` does this for you and defaults to V2.

`signatureType` in `authorizeKey` is the **inner** key type: `0 = secp256k1`, `1 = p256`,
`2 = webAuthn`. It is not the envelope type.

---

## 9. Known-wrong documentation

Flagging these so nobody re-derives them from the docs site:

- Tempo's own guide pages (`/developers/docs/guide/tempo-transaction`, wallet quickstart) print
  `0x77` for the user envelope and `0x76` for the fee-payer envelope. That is backwards and
  wrong. The protocol spec page, the Rust constant `FEE_PAYER_SIGNATURE_MAGIC_BYTE = 0x78`, and
  `ox`'s `TxEnvelopeTempo.feePayerMagic` all agree: **`0x76` transaction, `0x78` fee payer**.
  Confirmed empirically by serializing both forms.
- The spec page documents only Keychain V1 (`0x03`), which is deprecated. Build V2.
- The indexer docs describe a free tier. There is none on `api.tempo.xyz` for an anonymous
  caller: the first request returns 402. See INDEXER.md.
- `getRemainingLimit` is documented without the caveat that it reverts for period-based limits.

---

## 10. Minimal dependency set

```
viem@2.56.8      # ships viem/tempo natively, includes the generated ABIs and chain defs
ox@0.14.45       # TxEnvelopeTempo, SignatureEnvelope, KeyAuthorization (transitive via viem)
mppx@0.10.1      # MPP client, github.com/wevm/mppx, the wevm team
```

There is no separate Tempo SDK. `@tempo-xyz/sdk`, `tempo-viem`, `viem-tempo`, `@tempo/viem`
and `@mpp/sdk` do not exist on npm. `tapimo@0.15.1` is the server side of `api.tempo.xyz` and
is useful to read but is not a client dependency.
