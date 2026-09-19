import { describe, expect, it } from 'vitest'
import { BaseError, ContractFunctionRevertedError } from 'viem'
import {
  decodeRevert,
  explain,
  KEYCHAIN_ERRORS,
  TIP20_ERRORS,
  UNDOCUMENTED_ERRORS,
} from '../../src/errors.js'

describe('the error table is derived from the ABI, not transcribed', () => {
  it('carries the enforcement errors at their real selectors', () => {
    expect(KEYCHAIN_ERRORS.get('0x8a9e71ea')?.name).toBe('SpendingLimitExceeded')
    expect(KEYCHAIN_ERRORS.get('0x576b38b4')?.name).toBe('CallNotAllowed')
    expect(KEYCHAIN_ERRORS.get('0x2572e3a9')?.name).toBe('KeyExpired')
    expect(KEYCHAIN_ERRORS.get('0xcdf0b34f')?.name).toBe('KeyAlreadyRevoked')
    expect(KEYCHAIN_ERRORS.get('0x5f3f479c')?.name).toBe('KeyNotFound')
  })

  it('records the on-chain error the published ABI omits', () => {
    expect(UNDOCUMENTED_ERRORS['0xaa4bc69a']?.note).toContain('getRemainingLimitWithPeriod')
    expect(KEYCHAIN_ERRORS.has('0xaa4bc69a')).toBe(false)
  })

  it('separates token errors from keychain errors', () => {
    expect(TIP20_ERRORS.get('0x832f98b5')?.name).toBe('InsufficientBalance')
  })
})

describe('decodeRevert', () => {
  it('reads a decoded viem contract revert', () => {
    const error = new BaseError('execution reverted', {
      cause: Object.assign(new Error('revert'), {
        data: { errorName: 'SpendingLimitExceeded', args: [] },
      }),
    })
    const decoded = decodeRevert(error)
    expect(decoded.name).toBe('SpendingLimitExceeded')
    expect(decoded.enforcement).toBe(true)
    expect(decoded.message).toContain('Consensus rule')
  })

  it('reads the error name out of a plain message string', () => {
    const decoded = decodeRevert(
      'The contract function reverted with the following reason:\nCallNotAllowed()',
    )
    expect(decoded.name).toBe('CallNotAllowed')
    expect(decoded.enforcement).toBe(true)
  })

  it('reads a bare selector out of revert data', () => {
    const decoded = decodeRevert('execution reverted: 0x576b38b4')
    expect(decoded.name).toBe('CallNotAllowed')
    expect(decoded.selector).toBe('0x576b38b4')
  })

  it('names the undocumented getRemainingLimit revert instead of showing a raw selector', () => {
    const decoded = decodeRevert('execution reverted 0xaa4bc69a')
    expect(decoded.name).toBe('PeriodLimitRequiresWithPeriodRead')
    expect(decoded.enforcement).toBe(false)
    expect(decoded.message).toContain('getRemainingLimitWithPeriod')
  })

  it('distinguishes a pre-execution rejection from a revert', () => {
    const decoded = decodeRevert(
      'failed to resolve access key signature: key not found for account',
    )
    expect(decoded.rejectedPreExecution).toBe(true)
    expect(decoded.message).toContain('never reached a block')
  })

  it('does not claim a failure is enforcement when it is a balance problem', () => {
    const decoded = decodeRevert('reverted with InsufficientBalance(1,2,0x00)')
    expect(decoded.name).toBe('InsufficientBalance')
    expect(decoded.enforcement).toBe(false)
    expect(decoded.message).toContain('not a policy failure')
  })

  it('keeps the raw text so the classifier can never hide detail', () => {
    const decoded = decodeRevert('something the table does not know about')
    expect(decoded.raw).toContain('something the table does not know about')
    expect(decoded.name).toBeUndefined()
    expect(decoded.enforcement).toBe(false)
  })

  it('walks nested causes', () => {
    const inner = new ContractFunctionRevertedError({
      abi: [{ type: 'error', name: 'CallNotAllowed', inputs: [] }],
      data: '0x576b38b4',
      functionName: 'transferWithMemo',
    })
    const outer = new BaseError('top', { cause: new BaseError('mid', { cause: inner }) })
    expect(decodeRevert(outer).name).toBe('CallNotAllowed')
  })

  it('handles null and undefined without throwing', () => {
    expect(decodeRevert(null).enforcement).toBe(false)
    expect(decodeRevert(undefined).raw).toBe('')
  })
})

describe('explain', () => {
  it('tells an operator that CallNotAllowed covers all three refusal shapes', () => {
    const text = explain('CallNotAllowed')
    expect(text).toContain('unlisted recipient')
    expect(text).toContain('plain transfer()')
    expect(text).toContain('unscoped token')
  })

  it('falls back to naming the error rather than inventing a meaning', () => {
    expect(explain('SomeFutureError')).toBe('Reverted SomeFutureError.')
  })
})
