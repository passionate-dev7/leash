import type { IncomingMessage, ServerResponse } from 'node:http'
import { getAddress, isAddress } from 'viem'
import type { Address, Hex } from 'viem'

export class HttpError extends Error {
  override name = 'HttpError'
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code)
  }
}

export const bad = (detail: string) => new HttpError(422, 'invalid_input', detail)
export const notFound = (what: string) => new HttpError(404, 'not_found', what)
export const conflict = (code: string, detail: string) => new HttpError(409, code, detail)

const MAX_BODY_BYTES = 1_000_000

export async function readBody(req: IncomingMessage): Promise<Buffer> {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new HttpError(413, 'body_too_large', `at most ${MAX_BODY_BYTES} bytes`)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'body_too_large', `at most ${MAX_BODY_BYTES} bytes`)
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

export function parseJsonObject(body: Buffer): Record<string, unknown> {
  if (body.length === 0) return {}
  let value: unknown
  try {
    value = JSON.parse(body.toString('utf8'))
  } catch {
    throw bad('body must be valid JSON')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw bad('body must be a JSON object')
  return value as Record<string, unknown>
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
  res.end(text)
}

export function str(body: Record<string, unknown>, key: string, opts: { min?: number; max: number }): string {
  const v = body[key]
  if (typeof v !== 'string') throw bad(`${key} is required and must be a string`)
  const t = v.trim()
  if (t.length < (opts.min ?? 1) || t.length > opts.max) throw bad(`${key} must be ${opts.min ?? 1} to ${opts.max} characters`)
  return t
}

export function address(value: unknown, field: string): Address {
  if (typeof value !== 'string' || !isAddress(value, { strict: false })) throw bad(`${field} must be an address`)
  return getAddress(value)
}

export function txHash(value: unknown, field = 'tx'): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw bad(`${field} must be a 32 byte transaction hash`)
  return value.toLowerCase() as Hex
}

export type Handler = (ctx: {
  params: Record<string, string>
  query: URLSearchParams
  req: IncomingMessage
}) => Promise<unknown>

export type Route = { method: string; pattern: RegExp; keys: string[]; handler: Handler }

/** Pattern like `/api/teams/:account/agents`. Params match a single path segment. */
export function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = []
  const source = path.replace(/:([a-zA-Z]+)/g, (_m, k: string) => {
    keys.push(k)
    return '([^/]+)'
  })
  return { method, pattern: new RegExp(`^${source}$`), keys, handler }
}

export function match(routes: readonly Route[], method: string, path: string): { route: Route; params: Record<string, string> } | 'method' | null {
  let pathMatched = false
  for (const r of routes) {
    const m = r.pattern.exec(path)
    if (!m) continue
    pathMatched = true
    if (r.method !== method) continue
    return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])) }
  }
  return pathMatched ? 'method' : null
}
