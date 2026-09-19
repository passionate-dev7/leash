# CRITICAL-PATH: does fee sponsorship compose with access-key signing?

**Yes. Definitively, on two independent paths, with receipts.**

The `cast` test that "silently fell back to sender-pays" was a tooling gap, not a protocol
limit. `cast` does not know how to build a type-`0x76` envelope with a `fee_payer_signature`,
so it produced a self-paid transaction that looked superficially similar. The protocol
supports the combination, `ox`/`viem` implement it, and Moderato accepts and executes it.

All transactions below are on Moderato, chain 42431, 2026-09-18. Explorer:
`https://explore.testnet.tempo.xyz`.

---

## 1. Cast of characters

| role | address |
|---|---|
| root account (the "agent fleet owner") | `0x171062b563f575ac87c42D597c331b0D05a72605` |
| access key #1 | `0xE21335Bbf21b68EF6ab8f337A21656D1a8d3719a` |
| access key #2 | `0x64eb6C85AEbb09C57ab46Bd1dE6AE1Ef20063281` |
| self-hosted fee payer | `0xBB48187F1b813357ad073D43C307531B26F8173A` |
| **Tempo's public sponsor** | `0x58Aa7CE42E1D13B2919E2ac7E006c4fBC171442c` |
| allowed merchant | `0x3Ea86ae0B21C583772514e98dcD0943c19D4daf4` |
| disallowed merchant | `0xF45B4Ece0BcA5A00a7E0f5108348e9b8184584d6` |

Key policy in force for every test: PathUSD, cap 50.000000 per 30 days, `allowAnyCalls = false`,
one scope `{target: PathUSD, selector: 0x95777d59 transferWithMemo, recipients: [merchant]}`.
Authorized by `0x96c9531c55f0a4b56f17b840440f44c1dcf24043d46070889f37f72e7c0a3db7` (key #1)
and `0x7d773d36c10f6908a28236393b2ad6892b51a4f7b4b0fe010fa24fb5a31baa6e` (key #2).

---

## 2. The answer, in one table

Identical payment, identical key, identical policy. Only the fee path changes.

| | A. unsponsored | B. self-hosted fee payer | C. **public relay** |
|---|---|---|---|
| tx | `0x9428efd972b5ed8fadbc2a783c100e930d167390a6e4b839ec31fe6738d29387` | `0x2c2b9fc25af39574b8f28d143b1a31a3b526658c3d94d8007ab146d2a9732374` | `0xd5ff78c148f6bfca4b901781317cc956e9eb455274a478f557087d63010944ab` |
| status | success, type `0x76` | success, type `0x76` | success, type `0x76` |
| gasUsed | 301,438 | 76,738 | 76,750 |
| `feePayerSignature` in tx | ABSENT | **PRESENT** | **PRESENT** |
| `receipt.feePayer` | self | `0xbb48187f…` | **`0x58aa7ce42e1d13b2919e2ac7e006c4fbc171442c`** |
| payment delivered | 3.000000 | 3.000000 | 2.000000 |
| **budget debited** | **3,003,597** | **3,000,000** | **2,000,000** |
| root account delta | −3,003,597 | −3,000,000 | −2,000,000 |
| sponsor delta | 0 | −916 | −916 |
| `AccessKeySpend` events | **2** (gas 3,803 + payment 3,000,000) | **1** (payment only) | **1** (payment only) |

Sponsorship composes, and it does more than compose: it removes gas from the access key's
budget accounting entirely.

---

## 3. Path C is the one that matters

Path B proves the protocol works. Path C proves a builder does not have to run anything.

`https://sponsor.moderato.tempo.xyz` is Tempo's own fee-payer relay. It is open, requires no
API key, and it co-signed a transaction whose sender signature was a **Keychain V2 access key
envelope**, not a root key.

```ts
import { Transport, Account, Actions } from 'viem/tempo'

const agentKey = Account.fromSecp256k1(AGENT_PK, { access: owner })

const client = createClient({
  account: agentKey,
  chain: tempoModerato.extend({ feeToken: PathUSD }),
  transport: Transport.withRelay(
    http(),                                       // broadcast
    http('https://sponsor.moderato.tempo.xyz'),   // sponsor
  ),
}).extend(publicActions).extend(walletActions)

await client.sendTransaction({
  calls: [{ to: PathUSD, data: transferWithMemoCalldata }],
  feePayer: true,
})
```

Receipt, read back from the node:

```
tx            0xd5ff78c148f6bfca4b901781317cc956e9eb455274a478f557087d63010944ab
status/type   success 0x76   gasUsed 76750
feePayerSig   PRESENT
budget spent  2000000  (transfer was 2000000)
OWNER   delta -2000000
PUBLIC SPONSOR 0x58Aa7CE42E1D13B2919E2ac7E006c4fBC171442c delta -916
MERCHANT delta 2000000
EVENT AccessKeySpend { account: 0x1710…, publicKey: 0x64eb…,
                       token: 0x20C0…0000, amount: "2000000", remainingLimit: "48000000" }
receipt.feePayer = 0x58aa7ce42e1d13b2919e2ac7e006c4fbc171442c
receipt.feeToken = 0x20c0000000000000000000000000000000000000
```

`receipt.feePayer` is a first-class field on the Tempo receipt and is also exposed as a column
on the indexer's `receipts` table. Leash gets sponsorship attribution for free.

Note `Transport.withFeePayer` exists but is marked deprecated in favour of `withRelay`.

---

## 4. Why it composes, from the source

This is not an accident of implementation, it is designed in. Three independent pieces of
evidence from `ox@0.14.45` and `viem@2.56.8`:

**a. The envelope has both fields, orthogonally.** `ox/tempo/TxEnvelopeTempo.ts`:

```ts
/** Fee payer signature. */
feePayerSignature?: Signature.Signature<true, …> | null | undefined
…
signature: SignatureEnvelope.SignatureEnvelope<…>   // may be type 'keychain'
```

**b. The sender's signing preimage explicitly excludes the fee payer signature.**
`encodeForSigning`:

```ts
return serialize({
  ...envelope,
  signature: undefined,
  // When a fee payer signature is present, normalize to `null` (the presign marker).
  ...(envelope.feePayerSignature !== undefined ? { feePayerSignature: null } : {}),
})
```

and `viem/tempo/Account.ts`, in the access key account's `signTransaction`:

```ts
if ('feePayerSignature' in transaction && transaction.feePayerSignature)
  return { ...transaction, feePayerSignature: null }
```

The `null` marker serialises to the single byte `0x00` and also suppresses `fee_token` from the
sender's preimage, which is precisely what lets the sponsor choose the fee token without
invalidating the agent's signature.

**c. The fee-payer serializer knows what a keychain signature is.** In `format: 'feePayer'`
mode `ox` must recover the sender address to embed it, and it special-cases access keys:

```ts
if (sig.type === 'keychain')  return sig.userAddress
if (sig.type === 'p256' || sig.type === 'webAuthn') return Address.fromPublicKey(sig.publicKey)
if (sig.type === 'secp256k1') return Secp256k1.recoverAddress({ … })
```

If access keys and sponsorship were mutually exclusive, that first line would not exist.

### Wire format

```
0x76 || rlp([ chain_id, max_priority_fee_per_gas, max_fee_per_gas, gas_limit,
              calls, access_list, nonce_key, nonce, valid_before, valid_after,
              fee_token,
              fee_payer_signature,     <-- field index 11
              aa_authorization_list,
              key_authorization?,      <-- optional, provisions a key in the same tx
              sender_signature ])      <-- may be a 0x04 Keychain V2 envelope
```

Sender hash is over the `0x76` form with `fee_payer_signature = 0x00` and `fee_token = 0x80`.
Fee payer hash is over a **`0x78`**-prefixed form that includes `fee_token` and the 20-byte
sender address in place of the signature slot. Two domains, one envelope. Fee payers must be
secp256k1.

The docs' guide pages say `0x77`/`0x76`. That is wrong. It is `0x76`/`0x78`.

---

## 5. Sponsorship is not a bypass, and that is load-bearing

The obvious attack on a sponsored design: if a third party pays the gas, does the enforcement
still run against the agent's key? A relay that could launder a disallowed call would make
Leash's core claim false.

Every negative control was re-run **with sponsorship attached**:

| attempt (sponsored) | result |
|---|---|
| pay a recipient not on the allowlist | revert `CallNotAllowed` |
| use `transfer()` instead of `transferWithMemo` to an **allowed** merchant | revert `CallNotAllowed` |
| exceed the 50 USDC cap | revert `SpendingLimitExceeded` |
| pay in a token the key has no scope for | revert `CallNotAllowed` |
| allowed merchant, allowed selector, in budget | **success**, `0x58b9c4006845b1261bea9c5389d1282bcee1f506eff256c3656e9260b871324d` |

Controls that had to pass, and did: the same allowed payment unsponsored
(`0x2c95d0643a5969991f77b889bea78989b0886d64d196d67a27b58cc0ff0ec22b`), and the **root** key
successfully doing the thing the access key was refused
(`0x698b0864487cba09bd513d08a681c2345ca0c738c4456914c48f1457ea463c26`). Without that second
control the revert list would be consistent with a broken client rather than with enforcement.

**Blind spot, stated:** these controls used a self-hosted fee payer, not the public relay. The
public relay was exercised only on the success path. The enforcement happens in the precompile
during execution, and the relay's signature is over the fee domain only, so there is no
mechanism by which the relay could alter the outcome. But it is not directly measured, and it
should be, before the submission demo.

### The kill switch is not sponsorable either

After `revokeKey` (`0xb09ec73260261630e37bc20e13f44b8a3e4fbe4a0dfdcfcd7ed65f4e87b05a56`,
28,192 gas, 2.8 s submit-to-receipt), a sponsored spend with the same key was rejected by the
node before it reached a block. `getKey` returns a zeroed record with `isRevoked: true`.
Control: the root key transacted successfully immediately afterwards
(`0xddb5db121ea633526a332d18eee1a0f7f092f9bd9e45c12a35517cc1df6fc393`).

---

## 6. What this means for the LEASH design

1. **Sponsor by default.** It is not a nice-to-have, it is the thing that makes a per-token
   budget mean what an operator thinks it means. Unsponsored, a 50 USDC budget is "50 USDC of
   payments minus an unpredictable gas tax pre-charged at the gas limit". Sponsored, it is
   50 USDC of payments. The demo should show both numbers side by side because the difference
   is the argument.
2. **The sponsor is a second, independent control surface.** The agent's key says *what* may
   be paid. The sponsor policy says *whether this transaction gets to exist at all*. Tempo's
   own relay implementation exposes refusal reasons (`billing_past_due`, `billing_required`,
   `fee_token_unsupported`, `spend_limit_exceeded`, `tx_fee_limit_exceeded`) and falls back to
   a self-paid fill rather than erroring. Leash can run its own relay to add a fleet-level
   circuit breaker above the per-key consensus rule, which is a genuinely two-layer story:
   consensus-enforced per key, policy-enforced per fleet.
3. **Telemetry gets cleaner.** A sponsored key emits exactly one `AccessKeySpend` per payment.
   An unsponsored key emits gas events interleaved with payment events on the same token from
   the same key, and the final event's `remainingLimit` is stale by the gas refund. Leash's
   live spend feed should either require sponsorship or carry an explicit classifier.
4. **`receipt.feePayer` is the attribution primitive.** It is on the receipt and on the
   indexer's `receipts` table, so "who paid for this agent's work" is a join, not an inference.

---

## 7. Fallback design, if sponsorship had not composed

It does compose, so this is contingency only. Recorded because the brief asked for it and
because the mainnet sponsor endpoint is UNCONFIRMED.

**Fallback 1, budget headroom.** Size every budget as
`N * amt + N * ceil(gasLimit * maxFeePerGas / 10^(18-decimals))`, using the gas **limit** not
gas used, because the pre-charge is at the limit. Display two numbers in the UI, "payment
budget" and "gas reserve", and reconcile the gas reserve from the refund each period. Ugly and
honest. Costs about 0.12% at Moderato's gas price and it changes with the gas market, which is
exactly why it is a fallback.

**Fallback 2, fee token segregation.** Give the key a spending limit on the **payment** token
only, and set the transaction's `fee_token` to a *different* TIP-20 the key has no limit on.
The budget then constrains payments exactly, and gas is drawn from an unmetered token the root
account funds separately. This is testable today on Moderato, which mints four distinct
stablecoins to every faucet account. UNVERIFIED: whether the precompile debits a limit for a
token that has no `TokenLimit` entry, or refuses the call. The `enforceLimits` flag and the
per-token `limits` array suggest a token with no entry is unmetered, but this was not measured
and must be before relying on it.

**Fallback 3, two keys per agent.** A tightly scoped payment key sponsored by the operator,
plus an unscoped low-cap gas key. Doubles the provisioning cost, which at 3.3M gas per key is
not free, and doubles the revocation surface. Least attractive.

None of these are needed. Ship path C.

---

## 8. Open items before the submission

- Re-run the four negative controls through the **public relay** rather than a self-hosted fee
  payer, to close the blind spot in §5.
- Confirm a mainnet sponsor endpoint exists and its terms. `sponsor.tempo.xyz` appears as a
  `url` in the Moderato sponsor's self-description but was not exercised. Authenticated
  sponsorship goes through `POST https://api.tempo.xyz/rpc/sponsor` with scope
  `rpc-relay:sponsor`, and Tempo console API keys are invite-only per their FAQ. **This is the
  single biggest remaining unknown for a mainnet demo.**
- Measure whether a `fee_token` with no `TokenLimit` entry is unmetered (fallback 2), because
  it is a cheap hedge if mainnet sponsorship turns out to be gated.
