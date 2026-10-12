// Layout overlap test: builds the web app, serves it with vite preview, and runs the
// overlap scan (test/overlap.mjs) at 1440, 768 and 390 on #/quote-cap and #/delivery-cut,
// before and after the primary action. Fails on any text collision, text under a
// translucent sticky bar, or horizontal overflow.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
// @ts-expect-error plain ESM helper shared with the screenshot script
import { runOverlap } from './overlap.mjs'

function findChrome(): string | undefined {
  if (process.env.LEASH_CHROME) return process.env.LEASH_CHROME
  const cache = join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright')
  if (!existsSync(cache)) return undefined
  for (const d of readdirSync(cache).filter((x) => x.startsWith('chromium_headless_shell-')).sort().reverse()) {
    for (const sub of ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
      const p = join(cache, d, sub); if (existsSync(p)) return p
    }
  }
  return undefined
}

const chrome = findChrome()
test('no overlapping text at 1440, 768 and 390', { skip: chrome ? false : 'no Playwright chromium found (set LEASH_CHROME)', timeout: 300_000 }, async () => {
  execSync('pnpm exec vite build', { stdio: 'ignore' })
  const port = 4300 + Math.floor(Math.random() * 500)
  const srv = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
  try {
    await new Promise((r) => setTimeout(r, 2500))
    const browser = await chromium.launch({ executablePath: chrome })
    const problems: string[] = await runOverlap(browser, `http://localhost:${port}`, process.env.LEASH_OVERLAP_SHOTS)
    await browser.close()
    assert.deepEqual(problems, [], problems.join('\n'))
  } finally { srv.kill() }
})
