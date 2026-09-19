import { runDemo } from './script.js'
import type { DemoEvent } from './script.js'

/**
 * The same script the browser demo runs, printed to a terminal. Useful for CI, for a recording
 * where a screen is not available, and as the thing to run when someone says the UI is doing
 * the work: it is not, the chain is.
 *
 * `--json` emits one JSON object per line so the run can be replayed or diffed.
 */

const JSON_MODE = process.argv.includes('--json')
const SKIP_POST_REVOKE = process.argv.includes('--skip-post-revoke')

const C = {
  dim: (s: string) => `[2m${s}[0m`,
  bold: (s: string) => `[1m${s}[0m`,
  amber: (s: string) => `[38;5;214m${s}[0m`,
  green: (s: string) => `[38;5;42m${s}[0m`,
  red: (s: string) => `[38;5;203m${s}[0m`,
  grey: (s: string) => `[38;5;245m${s}[0m`,
}

const units = (value: string | bigint, decimals: number): string => {
  const digits = String(value).padStart(decimals + 1, '0')
  return `${digits.slice(0, digits.length - decimals)}.${digits.slice(digits.length - decimals)}`
}

const bar = (remaining: bigint, cap: bigint, width = 34): string => {
  if (cap <= 0n) return ''
  const filled = Number((remaining * BigInt(width)) / cap)
  return `${'█'.repeat(Math.max(0, filled))}${'·'.repeat(Math.max(0, width - filled))}`
}

let tickLine = false
const out = (line: string) => {
  if (tickLine) {
    process.stdout.write('\r[K')
    tickLine = false
  }
  process.stdout.write(`${line}\n`)
}

function print(e: DemoEvent): void {
  if (JSON_MODE) {
    out(JSON.stringify(e))
    return
  }
  switch (e.type) {
    case 'start':
      out('')
      out(C.bold('  LEASH, spend control enforced in consensus'))
      out(C.grey(`  ${e.network['name']} ${e.network['chainId']} · ${e.network['rpcUrl']}`))
      out(C.grey(`  operator ${e.network['operator']}`))
      out(C.grey(`  ${String(e.network['settlementNote'])}`))
      out('')
      break
    case 'step':
      out('')
      out(`${C.amber('▸')} ${C.bold(e.title.toUpperCase())}  ${C.grey(e.line)}`)
      break
    case 'fact':
      out(`    ${e.label.padEnd(24)} ${e.value}`)
      if (e.source) out(C.grey(`    ${' '.repeat(24)} ${e.source}${e.at ? ` @ ${e.at}` : ''}`))
      break
    case 'services':
      for (const s of e.services)
        out(
          `    ${s.serviceId.padEnd(12)} ${s.recipient}  ${units(s.amount, s.decimals).padStart(10)} ${s.intent}\n${C.grey(`                 ${s.endpoint}  HTTP 402 at ${s.resolvedAt}`)}`,
        )
      break
    case 'blast': {
      const n = e.collateral.length
      out('')
      out(`    ${C.amber(C.bold(String(n)))} ${C.bold('services this key can pay that nobody asked for')}`)
      out(C.grey(`    ${e.headline}`))
      out(C.grey(`    one payout address ${e.recipient}`))
      out(`    named   ${e.intended.map((s) => s.serviceId).join(' ')}`)
      out(`    unnamed ${C.amber(e.collateral.map((s) => s.serviceId).join(' '))}`)
      if (e.advice) out(C.amber(`    ${e.advice}`))
      out('')
      break
    }
    case 'policy':
      for (const line of e.lines) out(C.grey(`    · ${line}`))
      out(C.grey(`    · calldata ${e.calldataBytes} bytes, selector ${e.selector}`))
      for (const g of e.gaps) out(C.amber(`    ! ${g.name} (${g.kind}): ${g.detail}`))
      break
    case 'budget': {
      const remaining = BigInt(e.remaining)
      const cap = BigInt(e.cap)
      out(
        `    ${C.bold(units(remaining, e.decimals).padStart(12))} ${e.symbol}  ${bar(remaining, cap)}${e.delta ? C.grey(`  −${units(e.delta, e.decimals)}`) : ''}`,
      )
      out(C.grey(`    read ${e.source.split(' @ ')[0]} @ block ${e.blockNumber} ${e.readAt}`))
      if (e.eventRemaining !== undefined && e.eventGap !== '0')
        out(
          C.grey(
            `    last AccessKeySpend event said ${units(e.eventRemaining, e.decimals)}, precompile says ${units(remaining, e.decimals)}, gap ${units(e.eventGap ?? '0', e.decimals)}. The event is stale by the gas refund.`,
          ),
        )
      break
    }
    case 'attempt':
      out('')
      out(`    ${C.bold(e.label)}`)
      out(C.grey(`      ${e.detail}`))
      out(C.grey(`      expect: ${e.expected}`))
      break
    case 'result':
      if (e.outcome === 'allowed')
        out(
          `      ${C.green('ALLOWED')} ${e.hash ?? ''} ${e.gasUsed ? `gas ${e.gasUsed}` : ''} ${e.elapsedMs} ms${e.feePayer ? C.grey(` feePayer ${e.feePayer}`) : ''}`,
        )
      else
        out(
          `      ${C.red(e.outcome === 'refused' ? 'REFUSED' : 'REJECTED')} ${C.bold(e.revertName ?? 'unnamed')} ${e.elapsedMs} ms  preExecution=${e.preExecution}\n${C.grey(`        ${e.revertMessage ?? ''}`)}\n${C.grey(`        raw: ${e.revertRaw ?? ''}`)}`,
        )
      break
    case 'tick':
      process.stdout.write(`\r[K      ${C.grey(`waiting ${(e.elapsedMs / 1000).toFixed(0)} s, ${e.note}`)}`)
      tickLine = true
      break
    case 'note':
      out(C.grey(`      ${e.text}`))
      break
    case 'done':
      out('')
      out(C.bold(`  done in ${(e.elapsedMs / 1000).toFixed(1)} s`))
      for (const v of e.verdict) out(`   ${C.green('·')} ${v}`)
      out('')
      break
    case 'error':
      out(C.red(`  ERROR ${e.message}`))
      break
  }
}

try {
  await runDemo((e) => print(e), SKIP_POST_REVOKE ? { skipPostRevoke: true } : {})
} catch (error) {
  print({ type: 'error', message: (error as Error).message })
  process.exitCode = 1
}
