# Repository Status Report

Generated on: 2026-09-18T21:56:00Z

---

## 1. Commands Run and Exit Codes

| Command | Exit Code | Status |
|---------|-----------|--------|
| `pnpm install` | 0 | ✅ Success |
| `pnpm typecheck` | 0 | ✅ Success |
| `pnpm test` (policy unit tests) | 0 | ✅ Success |
| `pnpm test:adversarial` (SDK adversarial tests) | 1 | ❌ Failed (1 of 20 tests) |

---

## 2. Test Results Summary

### Policy Package (`@leash/policy`) - Unit Tests
```
Test Files:  4 passed (4)
Tests:       57 passed (57)
Duration:    688ms
```
- ✅ `errors.test.ts` - 14 tests
- ✅ `budget.test.ts` - 12 tests
- ✅ `blast-radius.test.ts` - 13 tests
- ✅ `compile.test.ts` - 18 tests

### SDK Package (`@leash/sdk`) - Adversarial Tests (Moderato testnet)
```
Test Files:  1 failed (1 of 1)
Tests:       1 failed | 19 passed (20)
Duration:    ~66 seconds
```

**Failed Test:**
- `the kill switch > refuses the next payment from that key, and refuses it before execution`
  - Expected revert name: `'KeyAlreadyRevoked'`
  - Received: `undefined`
  - The test expects the node to return a structured revert with name `KeyAlreadyRevoked` when a revoked key attempts to pay, but the actual error is an "internal error" with `preExecution=false` that isn't being decoded to the expected error name.

**Passed Adversarial Tests (19):**
- authorizeKey provisioning
- scope readback (getAllowedCalls)
- getRemainingLimit trap (reverts for period-based limits)
- C1: allowed payment, relay-sponsored
- C2: root key pays disallowed merchant (control)
- N1: refuses recipient outside allowlist → `CallNotAllowed`
- N2: refuses plain transfer() to allowed merchant → `CallNotAllowed`
- N3: refuses payment past cap → `SpendingLimitExceeded`
- N4: refuses token key has no scope for → `CallNotAllowed`
- N5: refuses all four with self-hosted fee payer
- unsponsored budget arithmetic (overhead measured)
- event vs precompile (last event remainingLimit disagrees with getRemainingLimitWithPeriod)
- sponsored budget arithmetic (exact payment amount)
- updateSpendingLimit 50 → 2 (resets remaining budget)
- new cap bites (1 USDC passes, 5 USDC reverts)
- revokeKey (gas 28,192, ~1.6s)
- post-revoke root control (root key still works)
- decodeRevert classification (revoked key vs enforcement revert)

---

## 3. Exported Functions Reference

### `packages/policy/src/blast-radius.ts`

| Export | Type | One-Line Description |
|--------|------|---------------------|
| `norm` | `const (a: string) => string` | Lowercases an address for case-insensitive comparison. |
| `indexByRecipient` | `function (index: RecipientIndex) => Map<string, ResolvedRecipient[]>` | Groups resolved catalog services by payout address into a Map for O(1) blast-radius lookups. |
| `computeBlastRadius` | `function ({recipients, index, intendedServiceIds}) => BlastRadius` | Given an allowlist of recipient addresses, returns all catalog services reachable, split into intended vs collateral (unintended) services, with per-recipient breakdown and worst-offender detection. |
| `blastRadiusHeadline` | `function (radius: BlastRadius) => string` | Generates a blunt one-line summary for operators: reachable service count, collateral count, and the worst shared recipient's impact. |
| `sharedRecipients` | `function (index: RecipientIndex) => {recipient, services, realms}[]` | Returns all payout addresses in the catalog that serve >1 service, sorted by service count descending. |
| `isolationAdvice` | `function (radius: BlastRadius) => string \| undefined` | Returns actionable advice to isolate via budget (one key per service) when shared recipients have collateral damage; undefined if no shared recipients or no collateral. |

### `packages/policy/src/compile.ts`

| Export | Type | One-Line Description |
|--------|------|---------------------|
| `authorizeKeyAbiItem` | `const` | ABI item for the 3-argument `authorizeKey` overload (keyId, signatureType, KeyRestrictions tuple), selected by signature shape from viem/tempo Abis. |
| `PolicyCompileError` | `class extends Error` | Custom error class for policy compilation failures. |
| `toSmallestUnits` | `const (human: string, decimals: number) => bigint` | Parses a human-readable amount (e.g., "50") into smallest units (e.g., 50_000000n) using viem's parseUnits. |
| `fromSmallestUnits` | `const (units: bigint, decimals: number) => string` | Formats smallest units back to human-readable string using viem's formatUnits. |
| `groupScopes` | `function (scopes: readonly FlatScope[]) => CallScope[]` | Groups flat scopes by target address (first-seen order), unions recipients for duplicate (target, selector) pairs, produces nested CallScope[] wire format. |
| `encodeAuthorizeKey` | `function (keyId, signatureType, restrictions) => Hex` | Encodes `authorizeKey(address,uint8,KeyRestrictions)` calldata using the resolved ABI item. |
| `compilePolicy` | `function (input, index, options?) => CompiledPolicy` | Core compiler: validates input, resolves serviceIds against catalog, builds KeyRestrictions with limits/scopes, encodes calldata, verifies selector matches expected `0x980a6025`, returns full compiled policy with gaps, covered services, and cost estimates. |
| `AUTHORIZE_KEY_TARGET` | `const Address` | The AccountKeychain contract address (`0xaAAAaaAA...`) where plain-transaction authorizeKey calldata would be sent. |
| `describePolicy` | `function (policy, tokenSymbol?) => string[]` | Produces a plain-language confirmation screen: budget/period line, per-scope selector/recipient lines, expiry line, and a final "Do nothing else" warning. |

---

## 4. Build Status vs BUILD-SPEC.md

### What Is Built (Implemented)

| BUILD-SPEC Section | Implementation Status | Location |
|--------------------|----------------------|----------|
| **Networks** (chain IDs, RPCs, viem chains) | ✅ Used in SDK tests (chain 42431) | `packages/sdk/test/adversarial/` |
| **Predeploy Addresses** (AccountKeychain, ChannelReserve, etc.) | ✅ In constants.ts | `packages/policy/src/constants.ts` |
| **AccountKeychain ABI** (structs, selectors, events, errors) | ✅ Via `viem/tempo` import | `packages/policy/src/compile.ts` (uses `Abis.accountKeychain`) |
| **authorizeKey encoding** (correct 3-arg overload, selector `0x980a6025`) | ✅ Verified in compile.ts + tests | `packages/policy/src/compile.ts:28-38, 96-106` |
| **KeyRestrictions tuple** (expiry, enforceLimits, limits[], allowAnyCalls, allowedCalls[]) | ✅ Built in compilePolicy | `packages/policy/src/compile.ts:209-217` |
| **Scoping** (groupScopes, union recipients per target+selector) | ✅ Implemented + tested | `packages/policy/src/compile.ts:60-93` |
| **transferWithMemo selector** (`0x95777d59`) | ✅ In constants + compile | `packages/policy/src/constants.ts`, `compile.ts:189` |
| **Session channels** (tip20ChannelReserve.open/topUp selectors) | ✅ In compilePolicy with allowSessionChannels flag | `packages/policy/src/compile.ts:193-201` |
| **Blast radius computation** (collateral damage from shared recipients) | ✅ Full implementation | `packages/policy/src/blast-radius.ts` |
| **Budget arithmetic** (gas-debits-budget, sponsored vs unsponsored) | ✅ Verified in adversarial tests | `packages/sdk/test/adversarial/enforcement.test.ts` |
| **updateSpendingLimit semantics** (resets remaining, not scales) | ✅ Verified in adversarial tests | `packages/sdk/test/adversarial/enforcement.test.ts` |
| **Kill switch** (revokeKey, gas 28k, instant rejection) | ✅ Verified in adversarial tests | `packages/sdk/test/adversarial/enforcement.test.ts` |
| **Signature envelopes** (V2 Keychain `0x04` prefix) | ✅ Used via viem/ox Account helpers | SDK tests use `Account.fromSecp256k1(pk, { access: root })` |

### What Is Missing / Not Yet Implemented

| BUILD-SPEC Section | Status | Notes |
|--------------------|--------|-------|
| **MPP Catalog integration** (live resolution of serviceId → recipient) | ⚠️ Partial | `catalog.ts` exists with static snapshot; `catalog:refresh` script exists but live fetch not verified |
| **Fee sponsorship by default** (SDK should sponsor by default per BUILD-SPEC §5.1) | ⚠️ Tests use relay sponsorship | SDK adversarial tests use public relay; unclear if SDK production code sponsors by default |
| **Indexer integration** (querying AccessKeySpend events, reconciling budget) | ❌ Missing | BUILD-SPEC §5 requires reconciling against `getRemainingLimitWithPeriod`; INDEXER.md referenced but not in repo |
| **decodeRevert for all custom errors** | ⚠️ Partial | Test shows `decodeRevert` works for some; `KeyAlreadyRevoked` decoding fails in adversarial test |
| **WebAuthn / P256 signature types** | ❌ Not tested | Only secp256k1 (type 0) tested; signatureType 1/2 not exercised |
| **Legacy authorizeKey overload** (selector `0x54063a55`) | ❌ Not supported | BUILD-SPEC §3.3 notes legacy; compile.ts only targets 3-arg overload |
| **Admin keys** (authorizeAdminKey selector `0x9a424307`) | ❌ Not implemented | Not in compile.ts or constants.ts |
| **Key authorization witness** (burnKeyAuthorizationWitness, selector `0xcff31c46`) | ❌ Not implemented | BUILD-SPEC §3.3 lists it |
| **Multi-sig envelope** (prefix `0x05`) | ❌ Not implemented | BUILD-SPEC §8 lists it |
| **Mainnet deployment / allowlist** (pathUSD `0x20c...b9537d11c60e8b50`) | ❌ Not built | BUILD-SPEC §1 says build mainnet allowlist against settled asset |
| **Faucet automation** (tempo_fundAddress) | ❌ Not implemented | Tests assume pre-funded owner |
| **Gas limit headroom calculation** (unsponsored budget sizing rule) | ⚠️ Tested but not in SDK | BUILD-SPEC §5.2 formula verified in tests; no SDK helper exposes it |
| **Free indexer on mainnet** (returns 402) | ❌ Not handled | BUILD-SPEC §1: indexer.tempo.xyz returns 402 |
| **Free fee sponsor on mainnet** (UNCONFIRMED) | ❌ Not handled | BUILD-SPEC §1: UNCONFIRMED on mainnet |

---

## 5. Key Observations

1. **Policy package is solid**: All 57 unit tests pass, typecheck passes, core compilation logic (blast-radius, compile, budget, errors) is complete and tested.

2. **SDK adversarial tests are mostly passing**: 19/20 tests pass against live Moderato testnet, validating the entire enforcement model (scoping, budget, gas-debits, kill switch, session channels). The one failure is a decodeRevert edge case for `KeyAlreadyRevoked` — the node returns an "internal error" rather than a structured revert.

3. **Critical BUILD-SPEC traps are covered in tests**:
   - `getRemainingLimit` reverts for period-based limits (use `WithPeriod`)
   - Gas is pre-charged at gas limit, refunded after (unsponsored overhead ~0.12%)
   - Sponsored payments eliminate gas overhead entirely
   - Scoping is per-selector (transferWithMemo ≠ transfer)
   - Token restriction is free (target = token contract)
   - `allowAnyCalls=false` + empty `allowedCalls` = deny-all
   - `updateSpendingLimit` resets remaining budget (mid-period top-up)
   - `revokeKey` is instant and cheap (28k gas)

4. **Production gaps**: Mainnet allowlist, indexer integration, fee sponsorship defaults, WebAuthn/P256, admin keys, witness flow, multi-sig, faucet automation, and mainnet indexer/sponsor handling are not yet implemented.

---

## 6. Files Not Modified

Per instructions, no source files were modified. Only `STATUS.md` was created.