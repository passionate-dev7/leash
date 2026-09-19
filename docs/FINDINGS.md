# FINDINGS

Corrections discovered by running the code, recorded so the specs do not keep asserting
something the chain does not do.

## F1, 2026-09-19: a revoked key's payment is refused, but opaquely and slowly

`docs/CRITICAL-PATH.md` records that a payment from a revoked access key is "refused during
keychain validation, not as an EVM revert: it never reaches a block and costs nothing. The node
names the error rather than failing opaquely." The adversarial suite encodes that as three
assertions in `packages/sdk/test/adversarial/enforcement.test.ts:461-463`.

**Measured on Moderato, chain 42431, 2026-09-19:**

```
REJECTED | post-revoke payment
  unnamed | preExecution=false | An internal error was received.
  duration 44,596 ms
```

So of the three claims:

| Claim | Reality |
|---|---|
| The payment is refused | **True.** This is the part that matters, and it holds. |
| Refused pre-execution, never reaching a block | **False.** `rejectedPreExecution=false`. |
| The node names the error | **False.** `name` is `undefined`; the raw text is "An internal error was received." |

The 44.6 second duration is the part worth staring at. A clean protocol-level refusal should be
immediate. Forty-five seconds and an unnamed internal error reads like a timeout or a retry path
in the relay rather than a decisive rejection, and that distinction is not yet established.

**What this changes.**

1. **Security is unaffected.** The revoked key cannot pay. The kill switch works.
2. **The demo beat is weaker than planned.** "Revoke mid-stream, watch the next call fail" is
   forty-five seconds of nothing followed by an unhelpful error. The strong beat is the revoke
   itself, which reads back as revoked in 2.1 seconds and passes its own test.
3. **The spec sentence must not ship as written.** Any submission copy claiming a named,
   pre-execution, zero-cost refusal would be claiming something a judge can disprove by running
   the suite in this repo.

**Open, and worth one experiment before the demo is cut:** whether the sponsored and the
unsponsored path differ here. All four negative controls (`CallNotAllowed` x3,
`SpendingLimitExceeded`) return named, decoded reverts on both paths; only the revoked-key case
degrades. If the relay is the thing timing out, a self-hosted fee payer may produce the clean
refusal the spec describes.

**Test status:** the assertion has been left failing rather than relaxed. A test that asserts
the behaviour we want and fails is worth more than one edited to match what we got.
