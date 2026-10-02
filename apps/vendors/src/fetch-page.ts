import dns from 'node:dns'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'
import zlib from 'node:zlib'

/**
 * Fetches a user-supplied https url for the scrape service. The url is attacker controlled, so
 * the connection itself is guarded: every address the hostname resolves to is checked at
 * connect time (no DNS rebinding window), private and link-local ranges are refused, only
 * port 443 is reachable, and each redirect hop is re-validated.
 */

export class PageError extends Error {
  override name = 'PageError'
}

const BLOCKED = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) BLOCKED.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96]] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv6')

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return false
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return isPublicAddress(mapped[1]!)
  return !BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

const guardedLookup: typeof dns.lookup = ((hostname: string, options: dns.LookupOptions, callback: (...a: unknown[]) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error)
    const list = addresses as dns.LookupAddress[]
    if (list.length === 0 || !list.every((a) => isPublicAddress(a.address)))
      return callback(new PageError(`${hostname} resolves to a non-public address`))
    if (options.all) return callback(null, list)
    return callback(null, list[0]!.address, list[0]!.family)
  })
}) as never

export function assertFetchable(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new PageError('url is not valid')
  }
  if (url.protocol !== 'https:') throw new PageError('url must be https')
  if (url.port !== '' && url.port !== '443') throw new PageError('only port 443 is reachable')
  if (url.username || url.password) throw new PageError('url must not carry credentials')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) !== 0 && !isPublicAddress(host)) throw new PageError('url points at a non-public address')
  return url
}

export type FetchedPage = { finalUrl: string; status: number; contentType: string; body: string }

type Limits = { timeoutMs: number; maxBytes: number; maxRedirects: number }

export async function fetchHtml(raw: string, limits: Limits): Promise<FetchedPage> {
  const deadline = Date.now() + limits.timeoutMs
  let url = assertFetchable(raw)
  for (let hop = 0; hop <= limits.maxRedirects; hop++) {
    const res = await request(url, deadline, limits.maxBytes)
    if (res.redirect) {
      url = assertFetchable(new URL(res.redirect, url).toString())
      continue
    }
    return { finalUrl: url.toString(), status: res.status, contentType: res.contentType, body: res.body }
  }
  throw new PageError('too many redirects')
}

type Hop = { status: number; contentType: string; body: string; redirect?: string }

function request(url: URL, deadline: number, maxBytes: number): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return reject(new PageError('timeout'))
    const req = https.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup,
        headers: { 'user-agent': 'LeashAtlasScrape/1.0 (+https://leash.invalid)', accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'gzip, deflate, br' },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const contentType = String(res.headers['content-type'] ?? '')
        const location = res.headers.location
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          res.resume()
          return resolve({ status, contentType, body: '', redirect: location })
        }
        if (status < 200 || status >= 300) {
          res.resume()
          return reject(new PageError(`upstream answered ${status}`))
        }
        if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
          res.resume()
          return reject(new PageError(`upstream content-type is not html: ${contentType || 'missing'}`))
        }
        const declared = Number(res.headers['content-length'])
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.resume()
          return reject(new PageError('upstream body is larger than 1.5 MB'))
        }
        const encoding = String(res.headers['content-encoding'] ?? 'identity').toLowerCase()
        const decoder =
          encoding === 'gzip' ? zlib.createGunzip() : encoding === 'deflate' ? zlib.createInflate() : encoding === 'br' ? zlib.createBrotliDecompress() : null
        if (encoding !== 'identity' && !decoder) {
          res.resume()
          return reject(new PageError(`unsupported content-encoding ${encoding}`))
        }
        const source = decoder ? res.pipe(decoder) : res
        const chunks: Buffer[] = []
        let size = 0
        source.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) {
            req.destroy(new PageError('upstream body is larger than 1.5 MB'))
            return
          }
          chunks.push(chunk)
        })
        source.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') }))
        source.on('error', (e) => reject(e))
        res.on('error', (e) => reject(e))
      },
    )
    const timer = setTimeout(() => req.destroy(new PageError('timeout')), remaining)
    req.on('close', () => clearTimeout(timer))
    req.on('error', (e) => reject(e instanceof PageError ? e : new PageError(e.message)))
    req.end()
  })
}
