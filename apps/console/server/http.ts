import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * A hand-rolled HTTP layer, deliberately. The console is an operator tool that signs
 * transactions with a root key; every dependency in its request path is attack surface, and
 * `node:http` plus one file server is the whole requirement.
 */

/** bigint is the native width of every number on this chain. JSON is not, so it goes as a string. */
export const jsonReplacer = (_key: string, value: unknown): unknown =>
  typeof value === 'bigint' ? value.toString() : value

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, jsonReplacer)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/**
 * Errors reach the operator intact. A spend-control console that swallows the reason a
 * transaction was refused is worse than one that shows a stack trace.
 */
export function sendError(res: ServerResponse, status: number, error: unknown): void {
  const e = error as { name?: string; message?: string; stack?: string }
  sendJson(res, status, {
    ok: false,
    error: {
      name: e?.name ?? 'Error',
      message: e?.message ?? String(error),
      stack: process.env['LEASH_DEBUG'] ? e?.stack : undefined,
    },
  })
}

export async function readJsonBody<T>(req: IncomingMessage, limitBytes = 256_000): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > limitBytes) throw new Error(`request body exceeded ${limitBytes} bytes`)
    chunks.push(buf)
  }
  if (size === 0) return {} as T
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

/** Serves one directory. Path traversal is rejected by resolving and re-checking the prefix. */
export function serveStatic(root: string, urlPath: string, res: ServerResponse): boolean {
  const rootAbs = resolve(root)
  const rel = normalize(decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath)).replace(
    /^(\.\.[/\\])+/,
    '',
  )
  const file = resolve(join(rootAbs, rel))
  if (!file.startsWith(rootAbs + '/') && file !== rootAbs) return false
  if (!existsSync(file) || !statSync(file).isFile()) return false
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(file).pipe(res)
  return true
}

/** Server-sent events, used by the demo to stream real chain beats as they land. */
export function openEventStream(res: ServerResponse): (event: string, data: unknown) => void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  return (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data, jsonReplacer)}\n\n`)
  }
}
