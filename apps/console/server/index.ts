import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import type { Address } from 'viem'
import { isAddress } from 'viem'
import { readJsonBody, sendError, sendJson, serveStatic } from './http.js'
import {
  NETWORK,
  catalogForPicker,
  config,
  diagnostics,
  keySpend,
  listFleet,
  previewPolicy,
  probeIndexerSources,
  provisionKey,
  resize,
  revoke,
  sharedRecipientTable,
} from './fleet.js'
import type { PolicyRequest } from './fleet.js'

/**
 * LEASH operator console.
 *
 * Binds to loopback. It signs with the fleet's root key, so it is not something to expose;
 * `LEASH_HOST` exists for a container, and changing it is a deliberate act.
 */

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url))
const PORT = Number(process.env['LEASH_PORT'] ?? 4174)
const HOST = process.env['LEASH_HOST'] ?? '127.0.0.1'

const address = (value: string | null): Address => {
  if (!value || !isAddress(value)) throw new Error(`"${value}" is not an address`)
  return value as Address
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const path = url.pathname
    const method = req.method ?? 'GET'

    try {
      if (path === '/api/config' && method === 'GET') return sendJson(res, 200, await config())

      if (path === '/api/indexer-sources' && method === 'GET')
        return sendJson(res, 200, { sources: await probeIndexerSources() })

      if (path === '/api/fleet' && method === 'GET') {
        const source = url.searchParams.get('source')
        return sendJson(res, 200, await listFleet(source ? { source } : {}))
      }

      if (path === '/api/catalog' && method === 'GET')
        return sendJson(res, 200, await catalogForPicker())

      if (path === '/api/shared-recipients' && method === 'GET')
        return sendJson(res, 200, await sharedRecipientTable())

      if (path === '/api/policy/preview' && method === 'POST')
        return sendJson(res, 200, await previewPolicy(await readJsonBody<PolicyRequest>(req)))

      if (path === '/api/keys' && method === 'POST')
        return sendJson(res, 200, await provisionKey(await readJsonBody<PolicyRequest>(req)))

      const keyMatch = /^\/api\/keys\/(0x[0-9a-fA-F]{40})\/(spend|revoke|resize|diagnostics)$/.exec(path)
      if (keyMatch) {
        const keyId = address(keyMatch[1]!)
        const action = keyMatch[2]
        if (action === 'spend' && method === 'GET') {
          const source = url.searchParams.get('source')
          const limit = url.searchParams.get('limit')
          return sendJson(
            res,
            200,
            await keySpend(keyId, {
              ...(source ? { source } : {}),
              ...(limit ? { limit: Number(limit) } : {}),
            }),
          )
        }
        if (action === 'revoke' && method === 'POST') return sendJson(res, 200, await revoke(keyId))
        if (action === 'resize' && method === 'POST') {
          const body = await readJsonBody<{ token: string; budgetHuman: string }>(req)
          return sendJson(res, 200, await resize(keyId, address(body.token), body.budgetHuman))
        }
        if (action === 'diagnostics' && method === 'GET') {
          const token = url.searchParams.get('token')
          return sendJson(res, 200, await diagnostics(keyId, token ? address(token) : undefined))
        }
      }

      if (path.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: `no route ${method} ${path}` })

      if (method === 'GET' && serveStatic(PUBLIC_DIR, path, res)) return
      if (method === 'GET' && serveStatic(PUBLIC_DIR, '/index.html', res)) return
      return sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      return sendError(res, 500, error)
    }
  })()
})

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `LEASH console on http://${HOST}:${PORT}  network=${NETWORK}  operator role=${process.env['LEASH_OPERATOR_ROLE'] ?? 'OWNER'}\n`,
  )
})
