import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from './config'

/** Base units (string or bigint) to a trimmed decimal such as "0.003". */
export function units(value: string | bigint | null | undefined, max = 6): string {
  if (value === null || value === undefined || value === '') return '0'
  const text = formatUnits(BigInt(value), TOKEN_DECIMALS)
  const [whole = '0', frac = ''] = text.split('.')
  const trimmed = frac.slice(0, max).replace(/0+$/, '')
  const grouped = BigInt(whole).toLocaleString('en-US')
  return trimmed ? `${grouped}.${trimmed}` : grouped
}

/** Money with at least two decimals: 1.00, 0.50, 0.987790. */
export function money(value: string | bigint | null | undefined): string {
  const u = units(value)
  const [whole = '0', frac = ''] = u.split('.')
  return `${whole}.${frac.padEnd(2, '0')}`
}

export const short = (value: string | null | undefined, head = 6, tail = 4) =>
  !value ? '' : value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`

export function ago(iso: string | number | null | undefined): string {
  if (!iso) return ''
  const t = typeof iso === 'number' ? iso : Date.parse(iso)
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const pct = (n: number) => `${Math.round(n * 100)}%`
