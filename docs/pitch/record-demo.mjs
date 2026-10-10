// Records demo-walkthrough.md against the live site. Usage: node record-demo.mjs (needs `playwright`).
import { chromium } from 'playwright'
import fs from 'node:fs'
const BASE = process.env.LEASH_URL || 'https://leash-eiy.pages.dev'
const out = new URL('.', import.meta.url).pathname
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out + '.video', size: { width: 1440, height: 900 } } })
const page = await ctx.newPage()
const w = (s) => page.waitForTimeout(s * 1000)
const scroll = async (px, steps = 20) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await w(0.08) } }
await page.goto(BASE + '/#/quote-cap', { waitUntil: 'networkidle' }); await w(14)
const card = page.getByRole('region', { name: 'Quote check' })
await card.scrollIntoViewIfNeeded(); await page.getByRole('radio', { name: 'No prompt' }).click(); await w(22)
const go = page.getByRole('button', { name: 'Let the agent pay this quote' })
await go.scrollIntoViewIfNeeded(); await go.hover(); await w(1); await go.click(); await w(14)
await page.getByRole('radio', { name: 'With prompt' }).click(); await w(4)
await page.getByRole('radio', { name: '2x' }).click(); await w(4)
await go.click(); await w(12)
await scroll(1800, 60); await w(8); await scroll(1200, 40); await w(10)
await page.goto(BASE + '/#/delivery-cut', { waitUntil: 'networkidle' }); await w(24)
const cut = page.getByRole('button', { name: 'Sign the cut' })
await cut.scrollIntoViewIfNeeded(); await cut.hover(); await w(1); await cut.click(); await w(19)
await scroll(1400, 40); await w(13)
await page.goto(BASE + '/#/quote-cap', { waitUntil: 'networkidle' }); await w(9)
const vid = page.video(); await ctx.close(); await browser.close()
fs.renameSync(await vid.path(), out + 'demo.webm'); fs.rmSync(out + '.video', { recursive: true, force: true })
console.log('saved', out + 'demo.webm')
