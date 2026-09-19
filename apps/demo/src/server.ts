import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { openEventStream, sendError, sendJson, serveStatic } from '@leash/console/http'
import { DEMO_STEPS, runDemo } from './script.js'
import type { DemoEvent } from './script.js'

/**
 * Serves the demo page and streams the run over server-sent events.
 *
 * One run at a time. The script mints a key, spends a real budget and revokes it; two
 * concurrent runs would interleave transactions from the same root account and produce a
 * nonce fight, so a second request is refused rather than queued.
 */

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url))
const PORT = Number(process.env['LEASH_DEMO_PORT'] ?? 4175)
const HOST = process.env['LEASH_DEMO_HOST'] ?? '127.0.0.1'

let running = false

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    try {
      if (url.pathname === '/api/steps') return sendJson(res, 200, { steps: DEMO_STEPS, running })

      if (url.pathname === '/api/run') {
        if (running) return sendJson(res, 409, { ok: false, error: 'a run is already in progress' })
        running = true
        const send = openEventStream(res)
        const skip = url.searchParams.get('skipPostRevoke') === '1'
        let closed = false
        req.on('close', () => {
          closed = true
        })
        try {
          await runDemo(
            (event: DemoEvent) => {
              if (!closed) send(event.type, event)
            },
            skip ? { skipPostRevoke: true } : {},
          )
        } catch (error) {
          const e = error as Error
          if (!closed) send('error', { type: 'error', message: e.message, stack: e.stack })
        } finally {
          running = false
          res.end()
        }
        return
      }

      if (url.pathname.startsWith('/api/'))
        return sendJson(res, 404, { ok: false, error: `no route ${url.pathname}` })

      if (serveStatic(PUBLIC_DIR, url.pathname, res)) return
      if (serveStatic(PUBLIC_DIR, '/index.html', res)) return
      return sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      return sendError(res, 500, error)
    }
  })()
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`LEASH demo on http://${HOST}:${PORT}\n`)
})
