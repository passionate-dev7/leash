# Leash STATUS, 2026-09-19

## F1 remedy applied: the kill-switch test now asserts what the chain does

`packages/sdk/test/adversarial/enforcement.test.ts` (the post-revoke block) previously
asserted CRITICAL-PATH.md's claim: refused pre-execution, named `KeyAlreadyRevoked`,
raw matching /keychain validation failed/. Measured reality (FINDINGS.md F1, Moderato,
chain 42431): refused yes, but unnamed (`name === undefined`), NOT pre-execution
(`rejectedPreExecution === false`), raw "An internal error was received.", ~45s.

The test now asserts the measured behavior, with a comment citing F1 and instructing
that if the relay starts refusing cleanly, this test failing on purpose is the signal
to update it and CRITICAL-PATH.md together.

## Test results, run directly on 2026-09-19

| Suite | Command | Result |
|---|---|---|
| policy | `pnpm --filter @leash/policy test` | 57 passed / 0 failed |
| adversarial (live Moderato) | `pnpm --filter @leash/sdk test:adversarial` | 20 passed / 0 failed, 83.9s |

Adversarial summary line from the run: `REJECTED post-revoke payment` followed by
`PASS post-revoke root control` — the kill switch still kills, and the root control
proves the account is not simply broken.

## Still open

- The 44.6s unnamed refusal (F1) remains a UX defect, not a security one. The F1
  experiment — self-hosted fee payer to test whether the relay is what times out —
  has not been run.
- CRITICAL-PATH.md does not itself carry the false sentence (only FINDINGS.md F1
  quotes it), so no doc edit was needed beyond the test.
